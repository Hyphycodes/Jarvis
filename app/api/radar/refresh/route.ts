/**
 * POST /api/radar/refresh
 *
 * Radar refresh is intentionally pull-based and manual. Do NOT call this
 * route from a page render, server component, or any automatic trigger.
 * It must only be invoked by an explicit user action (e.g. RefreshRadarButton).
 *
 * The route enforces a cooldown (RADAR_REFRESH_COOLDOWN_MINUTES) between runs.
 * Pass { force: true } in the request body to bypass the cooldown.
 *
 * Pipeline (Sprint 2.2):
 *   1. cooldown check
 *   2. expireOldCandidates
 *   3. buildBrainContext
 *   4. buildInterestGraph (seed + memory + behavior)
 *   5. runTasteStrategist → exploration lanes
 *   6. buildCuriosityPlan → typed source plan
 *   7. gatherFromCuriosityPlan (or static fallback)
 *   8. ingestCandidates per lane
 *   9. runRadarCuration → score → curator → critic → gates → apply
 *  10. log strategy snapshot into brain_decision_runs.raw_output
 */

import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { getDefaultLocation } from "@/lib/env";
import {
  describeAvailableSources,
  gatherFromCuriosityPlan,
  gatherRadarCandidates,
} from "@/lib/sources/gather";
import { ingestCandidates, expireOldCandidates } from "@/lib/sources/ingest";
import { runRadarCuration } from "@/lib/brain/runRadarCuration";
import { anthropicStatus, hasAnthropic } from "@/lib/ai/anthropic";
import { buildBrainContext } from "@/lib/brain/context";
import { buildInterestGraph } from "@/lib/brain/interestGraph";
import { runTasteStrategist } from "@/lib/brain/tasteStrategist";
import { buildCuriosityPlan } from "@/lib/brain/curiosity";
import { summarizeInterestGraph } from "@/lib/brain/interests";
import {
  RADAR_REFRESH_COOLDOWN_MINUTES,
} from "@/lib/brain/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type RefreshSummary = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  next_allowed_at?: string;
  candidates_found: number;
  inserted: number;
  updated: number;
  shortlisted: number;
  selected: number;
  rejected: number;
  expired: number;
  fallback_used: boolean;
  fallback_reason?: string;
  decision_run_id: string | null;
  errors: string[];
  // Sprint 2.2 additions
  lanes_total: number;
  lanes_aligned: number;
  lanes_adjacent: number;
  lanes_wildcard: number;
  source_plan_entries: number;
  skipped_lane_ids: string[];
  strategist_fallback_used: boolean;
};

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const supabase = await getServerSupabase();
    const anthropic = anthropicStatus();
    if (!anthropic.available) {
      console.warn("[radar.refresh] Anthropic unavailable", {
        reason: anthropic.reason,
        model: anthropic.model,
      });
    } else {
      console.info("[radar.refresh] Anthropic configured", {
        model: anthropic.model,
      });
    }

    // Optional body { force: true }
    let force = false;
    try {
      const body = await req.json().catch(() => ({}));
      force = Boolean((body as { force?: unknown }).force);
    } catch {
      // no-op
    }

    // ── Cooldown check ──────────────────────────────────────────────────
    if (!force) {
      const cd = await checkCooldown(owner.id);
      if (cd.blocked) {
        return NextResponse.json(emptySkipped("cooldown", cd.nextAllowedAt));
      }
    }

    const home = safeHome();

    // 1. Expire stale events first
    let expired = 0;
    try {
      expired = await expireOldCandidates();
    } catch (err) {
      console.error("[radar.refresh] expire failed", err);
    }

    // 2. Build context once — reused across pipeline stages
    const context = await buildBrainContext();

    // 3. Interest Graph
    const graph = buildInterestGraph({ context });

    // 4. Read current Radar/Holding inventory to inform strategist
    const inventory = await readInventoryCounts(owner.id);

    // 5. Taste Strategist → exploration lanes
    const strategist = await runTasteStrategist({
      context,
      graph,
      activeRadarCount: inventory.active,
      holdingCount: inventory.holding,
    });

    // 6. Recent lane ids for rotation (last 3 runs)
    const recentLaneIds = await readRecentLaneIds(owner.id);

    // 7. Curiosity Engine → typed source plan
    const curiosity = buildCuriosityPlan({
      lanes: strategist.output.lanes,
      graph,
      availableSources: describeAvailableSources(),
      recentLaneIds,
    });

    // 8. Gather — lane-driven if we have a plan, otherwise static fallback
    const useStaticFallback =
      curiosity.sourcePlan.length === 0 && strategist.output.lanes.length === 0;

    const lanes = useStaticFallback
      ? await gatherRadarCandidates({
          userId: owner.id,
          homeLat: home.lat,
          homeLng: home.lng,
          city: home.city,
          state: home.state,
        })
      : await gatherFromCuriosityPlan(
          {
            userId: owner.id,
            homeLat: home.lat,
            homeLng: home.lng,
            city: home.city,
            state: home.state,
          },
          curiosity,
        );

    const laneCounts = countLanesByMode(strategist.output.lanes);

    const summary: RefreshSummary = {
      ok: true,
      candidates_found: 0,
      inserted: 0,
      updated: 0,
      shortlisted: 0,
      selected: 0,
      rejected: 0,
      expired,
      fallback_used: false,
      fallback_reason: undefined,
      decision_run_id: null,
      errors: [],
      lanes_total: strategist.output.lanes.length,
      lanes_aligned: laneCounts.aligned,
      lanes_adjacent: laneCounts.adjacent,
      lanes_wildcard: laneCounts.wildcard,
      source_plan_entries: curiosity.sourcePlan.length,
      skipped_lane_ids: curiosity.skippedLaneIds,
      strategist_fallback_used: strategist.fallbackUsed,
    };

    // 9. Ingest each lane
    for (const lane of lanes) {
      summary.candidates_found += lane.candidates.length;
      const ingestResult = await ingestCandidates({
        source: lane.source,
        candidates: lane.candidates,
        destination: "radar",
      });
      summary.inserted += ingestResult.inserted;
      summary.updated += ingestResult.updated;
      summary.errors.push(...ingestResult.errors);
    }

    // 10. Curation pipeline (existing) with strategy snapshot for logging
    const curation = await runRadarCuration({
      strategy: {
        graph_summary: summarizeInterestGraph(graph),
        lanes: strategist.output.lanes,
        source_plan: curiosity.sourcePlan,
        skipped_lane_ids: curiosity.skippedLaneIds,
        strategist_fallback_used: strategist.fallbackUsed,
        strategist_reason: strategist.reason,
      },
    });

    summary.shortlisted = curation.shortlisted;
    summary.selected = curation.appliedSelected;
    summary.rejected = curation.appliedRejected;
    summary.fallback_used = curation.decision.fallbackUsed || !hasAnthropic();
    summary.fallback_reason = readFallbackReason(
      curation.decision.fallbackReason,
      strategist.fallbackUsed ? strategist.reason : undefined,
      summary.fallback_used && !hasAnthropic() ? "ANTHROPIC_API_KEY missing" : undefined,
    );
    summary.decision_run_id = curation.decisionRunId;

    return NextResponse.json(summary);
  } catch (error) {
    return handleError(error);
  }
}

// ── Cooldown ────────────────────────────────────────────────────────────────

async function checkCooldown(
  userId: string,
): Promise<{ blocked: boolean; nextAllowedAt?: string }> {
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from("brain_decision_runs")
      .select("created_at")
      .eq("user_id", userId)
      .eq("run_type", "radar.refresh")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return { blocked: false };
    const lastRun = new Date((data as { created_at: string }).created_at);
    const cooldownMs = RADAR_REFRESH_COOLDOWN_MINUTES * 60 * 1000;
    const nextAllowed = new Date(lastRun.getTime() + cooldownMs);

    if (Date.now() < nextAllowed.getTime()) {
      return { blocked: true, nextAllowedAt: nextAllowed.toISOString() };
    }
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}

async function readInventoryCounts(
  userId: string,
): Promise<{ active: number; holding: number }> {
  try {
    const supabase = await getServerSupabase();
    const [activeRes, holdingRes] = await Promise.all([
      supabase
        .from("surfaced_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("destination", "radar")
        .eq("status", "shown"),
      supabase
        .from("surfaced_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("destination", "holding")
        .in("status", ["discovered", "shown"]),
    ]);
    return {
      active: activeRes.count ?? 0,
      holding: holdingRes.count ?? 0,
    };
  } catch {
    return { active: 0, holding: 0 };
  }
}

async function readRecentLaneIds(userId: string): Promise<string[]> {
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from("brain_decision_runs")
      .select("raw_output")
      .eq("user_id", userId)
      .eq("run_type", "radar.refresh")
      .order("created_at", { ascending: false })
      .limit(3);
    if (!data) return [];
    const ids: string[] = [];
    for (const row of data as Array<{ raw_output: unknown }>) {
      const lanes = readLanesFromRawOutput(row.raw_output);
      for (const l of lanes) ids.push(l);
    }
    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

function readLanesFromRawOutput(rawOutput: unknown): string[] {
  if (!rawOutput || typeof rawOutput !== "object") return [];
  const strategy = (rawOutput as Record<string, unknown>).strategy;
  if (!strategy || typeof strategy !== "object") return [];
  const lanes = (strategy as Record<string, unknown>).lanes;
  if (!Array.isArray(lanes)) return [];
  return lanes
    .map((l) => {
      if (l && typeof l === "object" && "id" in l) {
        const id = (l as { id?: unknown }).id;
        return typeof id === "string" ? id : null;
      }
      return null;
    })
    .filter((s): s is string => s !== null);
}

function countLanesByMode(
  lanes: Array<{ mode: "aligned" | "adjacent" | "wildcard" }>,
): { aligned: number; adjacent: number; wildcard: number } {
  const out = { aligned: 0, adjacent: 0, wildcard: 0 };
  for (const l of lanes) out[l.mode]++;
  return out;
}

function readFallbackReason(
  ...reasons: Array<string | undefined>
): string | undefined {
  return reasons.find((reason) => typeof reason === "string" && reason.length > 0);
}

function emptySkipped(reason: string, next?: string): RefreshSummary {
  return {
    ok: true,
    skipped: true,
    reason,
    next_allowed_at: next,
    candidates_found: 0,
    inserted: 0,
    updated: 0,
    shortlisted: 0,
    selected: 0,
    rejected: 0,
    expired: 0,
    fallback_used: false,
    fallback_reason: undefined,
    decision_run_id: null,
    errors: [],
    lanes_total: 0,
    lanes_aligned: 0,
    lanes_adjacent: 0,
    lanes_wildcard: 0,
    source_plan_entries: 0,
    skipped_lane_ids: [],
    strategist_fallback_used: false,
  };
}

function safeHome() {
  try {
    return getDefaultLocation();
  } catch {
    return { lat: 41.85, lng: -87.65, city: "Chicago", state: "IL" };
  }
}

function handleError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
