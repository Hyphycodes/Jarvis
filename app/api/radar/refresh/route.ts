/**
 * POST /api/radar/refresh
 *
 * Radar refresh is intentionally pull-based and manual. Do NOT call this
 * route from a page render, server component, or any automatic trigger.
 * It must only be invoked by an explicit user action (e.g. RefreshRadarButton).
 *
 * The route enforces a cooldown (RADAR_REFRESH_COOLDOWN_MINUTES) between runs.
 * Pass { force: true } in the request body to bypass the cooldown.
 */

import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { getDefaultLocation } from "@/lib/env";
import { gatherRadarCandidates } from "@/lib/sources/gather";
import { ingestCandidates, expireOldCandidates } from "@/lib/sources/ingest";
import { runRadarCuration } from "@/lib/brain/runRadarCuration";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { RADAR_REFRESH_COOLDOWN_MINUTES } from "@/lib/brain/constants";

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
  decision_run_id: string | null;
  errors: string[];
};

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const supabase = await getServerSupabase();

    // Parse body (optional { force: true })
    let force = false;
    try {
      const body = await req.json().catch(() => ({}));
      force = Boolean((body as { force?: unknown }).force);
    } catch {
      // no-op: body is optional
    }

    // ── Cooldown check ──────────────────────────────────────────────────────
    if (!force) {
      const cooldownResult = await checkCooldown(owner.id);
      if (cooldownResult.blocked) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "cooldown",
          next_allowed_at: cooldownResult.nextAllowedAt,
          candidates_found: 0,
          inserted: 0,
          updated: 0,
          shortlisted: 0,
          selected: 0,
          rejected: 0,
          expired: 0,
          fallback_used: false,
          decision_run_id: null,
          errors: [],
        } satisfies RefreshSummary);
      }
    }

    const home = safeHome();

    // 1. Expire stale events first so they fall out of the pool.
    let expired = 0;
    try {
      expired = await expireOldCandidates();
    } catch (err) {
      console.error("[radar.refresh] expire failed", err);
    }

    // 2. Gather + normalize from all configured sources.
    const lanes = await gatherRadarCandidates({
      userId: owner.id,
      homeLat: home.lat,
      homeLng: home.lng,
      city: home.city,
      state: home.state,
    });

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
      decision_run_id: null,
      errors: [],
    };

    // 3. Ingest each lane.
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

    // 4. Score → shortlist → curator → critic → gates → apply.
    const curation = await runRadarCuration();
    summary.shortlisted = curation.shortlisted;
    summary.selected = curation.appliedSelected;
    summary.rejected = curation.appliedRejected;
    summary.fallback_used = curation.decision.fallbackUsed || !hasAnthropic();
    summary.decision_run_id = curation.decisionRunId;

    return NextResponse.json(summary);
  } catch (error) {
    return handleError(error);
  }
}

// ── Cooldown ──────────────────────────────────────────────────────────────────

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
    // On error, allow the refresh (fail-open)
    return { blocked: false };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
