import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwner } from "@/lib/auth";
import { anthropicStatus, hasAnthropic } from "@/lib/ai/anthropic";
import { buildBrainContext } from "@/lib/brain/context";
import { buildCuriosityPlan } from "@/lib/brain/curiosity";
import { buildInterestGraph } from "@/lib/brain/interestGraph";
import { summarizeInterestGraph } from "@/lib/brain/interests";
import { runRadarCuration } from "@/lib/brain/runRadarCuration";
import { runTasteStrategist } from "@/lib/brain/tasteStrategist";
import {
  generateSyntheticMoves,
  syntheticMoveToCandidate,
} from "@/lib/brain/moveGenerator";
import { RADAR_REFRESH_COOLDOWN_MINUTES } from "@/lib/brain/constants";
import { getDefaultLocation } from "@/lib/env";
import {
  describeAvailableSources,
  gatherFromCuriosityPlan,
  gatherRadarCandidates,
} from "@/lib/sources/gather";
import { expireOldCandidates, ingestCandidates } from "@/lib/sources/ingest";
import { runDayOfPromotion } from "@/lib/scheduling/promoteItems";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  AMBIENT_RUN_POLICIES,
  decisionRunType,
  type AmbientRunType,
} from "@/lib/intelligence/runTypes";
import {
  budgetForLog,
  createIntelligenceBudget,
  recordBudgetUsage,
} from "@/lib/intelligence/budget";
import { cleanupRadar } from "@/lib/intelligence/radarCleanup";
import { detectAndProposePatterns } from "@/lib/intelligence/patternDetector";
import { recomputeNorth } from "@/lib/north/recomputeNorth";
import { safeWriteIntelligenceTrace } from "@/lib/brain/intelligenceTrace";
import { readBriefingFromPayload } from "@/lib/brain/briefingTypes";
import { hasVapid, sendPushNotification } from "@/lib/push/send";
import type { PushSubscriptionRow, SurfacedItemRow } from "@/lib/types/database";

export type AmbientRunSummary = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  next_allowed_at?: string;
  run_type: AmbientRunType;
  candidates_found: number;
  inserted: number;
  updated: number;
  shortlisted: number;
  selected: number;
  rejected: number;
  expired: number;
  promoted_today: number;
  cleaned?: Awaited<ReturnType<typeof cleanupRadar>>;
  fallback_used: boolean;
  fallback_reason?: string;
  decision_run_id: string | null;
  budget: Record<string, unknown>;
  errors: string[];
  source_plan_entries: number;
  synthetic_moves: number;
};

export async function runAmbientIntelligence(input: {
  runType: AmbientRunType;
  force?: boolean;
  testMode?: boolean;
  ownerUserId?: string;
}): Promise<AmbientRunSummary> {
  const owner = input.ownerUserId
    ? { id: input.ownerUserId }
    : await requireOwner();
  const supabase = input.ownerUserId ? getSupabaseServiceClient() : await getServerSupabase();
  const runType = input.runType;
  const budget = await createIntelligenceBudget({
    userId: owner.id,
    runType,
    testMode: input.testMode,
  });
  const policy = AMBIENT_RUN_POLICIES[runType];
  const anthropic = anthropicStatus();
  if (!anthropic.available) {
    console.warn("[ambient] Anthropic unavailable", {
      runType,
      reason: anthropic.reason,
      model: anthropic.model,
    });
  }

  if (!input.force) {
      const cd = await checkCooldown(owner.id, runType, supabase);
    if (cd.blocked) {
      return emptySkipped(runType, cd.nextAllowedAt, budgetForLog(budget));
    }
  }

  let workingBudget = budget;
  const summary: AmbientRunSummary = {
    ok: true,
    run_type: runType,
    candidates_found: 0,
    inserted: 0,
    updated: 0,
    shortlisted: 0,
    selected: 0,
    rejected: 0,
    expired: 0,
    promoted_today: 0,
    fallback_used: !hasAnthropic(),
    fallback_reason: !hasAnthropic() ? "ANTHROPIC_API_KEY missing" : undefined,
    decision_run_id: null,
    budget: budgetForLog(workingBudget),
    errors: [],
    source_plan_entries: 0,
    synthetic_moves: 0,
  };

  try {
    summary.expired = await expireOldCandidates(owner.id);
  } catch (err) {
    summary.errors.push(`expire: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (runType === "daily_maintenance") {
    try {
      const promoted = await runDayOfPromotion();
      summary.promoted_today = promoted.promoted;
    } catch (err) {
      summary.errors.push(`promote: ${err instanceof Error ? err.message : String(err)}`);
    }
    summary.cleaned = await cleanupRadar(owner.id);
    try {
      await detectAndProposePatterns(owner.id, supabase);
    } catch (err) {
      summary.errors.push(`patterns: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const recompute = await recomputeNorth(owner.id);
      await safeWriteIntelligenceTrace({
        userId: owner.id,
        route: "ambient.daily_maintenance",
        surface: "north",
        decisionType: "north_recompute",
        reasoning: {
          updated: recompute.updated,
          window_days: recompute.windowDays,
          pillar_scores: recompute.pillarScores,
        },
        contextSummary: { pillar_scores: recompute.pillarScores },
      });
    } catch (err) {
      summary.errors.push(`north_recompute: ${err instanceof Error ? err.message : String(err)}`);
    }
    summary.decision_run_id = await logAmbientRun(owner.id, runType, summary, supabase);
    return { ...summary, budget: budgetForLog(workingBudget) };
  }

  if (runType === "holding_review") {
    summary.cleaned = await cleanupRadar(owner.id);
    workingBudget = recordBudgetUsage(workingBudget, {
      claudeCalls: hasAnthropic() ? 2 : 0,
      briefings: policy.maxBriefings,
    });
    const curation = await runRadarCuration({
      maxShortlist: Math.min(policy.maxCandidates, 40),
      maxSelected: 3,
      maxBriefings: policy.maxBriefings,
      runType: decisionRunType(runType),
      rawOutputExtra: {
        ambient: { run_type: runType, policy },
        budget: budgetForLog(workingBudget),
      },
    });
    summary.shortlisted = curation.shortlisted;
    summary.selected = curation.appliedSelected;
    summary.rejected = curation.appliedRejected;
    summary.decision_run_id = curation.decisionRunId;
    summary.fallback_used = curation.decision.fallbackUsed || !hasAnthropic();
    summary.fallback_reason = curation.decision.fallbackReason ?? summary.fallback_reason;
    return { ...summary, budget: budgetForLog(workingBudget) };
  }

  const context = await buildBrainContext({ userId: owner.id, supabase });
  const graph = buildInterestGraph({ context });
  const inventory = await readInventoryCounts(owner.id, supabase);
  const strategist = await runTasteStrategist({
    context,
    graph,
    activeRadarCount: inventory.active,
    holdingCount: inventory.holding,
  });
  workingBudget = recordBudgetUsage(workingBudget, {
    claudeCalls: strategist.fallbackUsed ? 0 : 1,
  });
  const recentLaneIds = await readRecentLaneIds(owner.id, supabase);
  const curiosity = buildCuriosityPlan({
    lanes: strategist.output.lanes,
    graph,
    availableSources: describeAvailableSources(),
    recentLaneIds,
    homeCity: context.homeCity,
  });
  summary.source_plan_entries = curiosity.sourcePlan.length;

  const home = safeHome();
  const useStaticFallback =
    curiosity.sourcePlan.length === 0 && strategist.output.lanes.length === 0;
  let lanes =
    policy.heavyDiscovery && runType !== "north_reflection" && home
      ? useStaticFallback
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
          )
      : [];
  if (policy.heavyDiscovery && runType !== "north_reflection" && !home) {
    summary.errors.push("Location-based discovery skipped: DEFAULT_HOME_LAT/DEFAULT_HOME_LNG are not configured.");
  }
  workingBudget = recordBudgetUsage(workingBudget, {
    sourceCalls: curiosity.sourcePlan.length,
    candidates: lanes.reduce((sum, lane) => sum + lane.candidates.length, 0),
  });

  const syntheticMoves = syntheticMovesEnabled()
    ? generateSyntheticMoves({
        context,
        mode: runType,
        activeRadarCount: inventory.active,
      })
    : [];
  summary.synthetic_moves = syntheticMoves.length;
  if (syntheticMoves.length > 0) {
    lanes = [
      ...lanes,
      {
        source: "ai",
        candidates: syntheticMoves.map(syntheticMoveToCandidate),
      },
    ];
  }

  for (const lane of lanes) {
    const candidates = lane.candidates.slice(0, policy.maxCandidates);
    summary.candidates_found += candidates.length;
      const ingest = await ingestCandidates({
        source: lane.source,
        candidates,
        destination: lane.source === "ai" ? undefined : "radar",
        userId: owner.id,
      });
    summary.inserted += ingest.inserted;
    summary.updated += ingest.updated;
    summary.errors.push(...ingest.errors);
  }

  workingBudget = recordBudgetUsage(workingBudget, {
    claudeCalls: hasAnthropic() ? 2 : 0,
    briefings: policy.maxBriefings,
  });
  const curation = await runRadarCuration({
    maxShortlist: Math.min(policy.maxCandidates, 120),
    maxSelected: runType === "weekend_preview" ? 5 : 4,
    maxBriefings: policy.maxBriefings,
    runType: decisionRunType(runType),
    strategy: {
      graph_summary: summarizeInterestGraph(graph),
      lanes: strategist.output.lanes,
      source_plan: curiosity.sourcePlan,
      skipped_lane_ids: curiosity.skippedLaneIds,
      strategist_fallback_used: strategist.fallbackUsed,
      strategist_reason: strategist.reason,
    },
    rawOutputExtra: {
      ambient: { run_type: runType, policy },
      budget: budgetForLog(workingBudget),
    },
  });
  summary.shortlisted = curation.shortlisted;
  summary.selected = curation.appliedSelected;
  summary.rejected = curation.appliedRejected;
  summary.decision_run_id = curation.decisionRunId;
  summary.fallback_used = curation.decision.fallbackUsed || strategist.fallbackUsed || !hasAnthropic();
  summary.fallback_reason =
    curation.decision.fallbackReason ??
    (strategist.fallbackUsed ? strategist.reason : undefined) ??
    summary.fallback_reason;
  summary.budget = budgetForLog(workingBudget);
  return summary;
}

function syntheticMovesEnabled(): boolean {
  return process.env.JARVIS_ENABLE_SYNTHETIC_MOVES === "true";
}

async function checkCooldown(
  userId: string,
  runType: AmbientRunType,
  supabase: SupabaseClient,
): Promise<{ blocked: boolean; nextAllowedAt?: string }> {
  try {
    const policy = AMBIENT_RUN_POLICIES[runType];
    const legacyType = runType === "radar_discovery" ? "radar.refresh" : decisionRunType(runType);
    const { data } = await supabase
      .from("brain_decision_runs")
      .select("created_at")
      .eq("user_id", userId)
      .in("run_type", [decisionRunType(runType), legacyType])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return { blocked: false };
    const lastRun = new Date((data as { created_at: string }).created_at);
    const cooldownMs =
      (runType === "radar_discovery"
        ? Math.max(policy.cooldownHours * 60, RADAR_REFRESH_COOLDOWN_MINUTES)
        : policy.cooldownHours * 60) *
      60 *
      1000;
    const nextAllowed = new Date(lastRun.getTime() + cooldownMs);
    return Date.now() < nextAllowed.getTime()
      ? { blocked: true, nextAllowedAt: nextAllowed.toISOString() }
      : { blocked: false };
  } catch {
    return { blocked: false };
  }
}

async function logAmbientRun(
  userId: string,
  runType: AmbientRunType,
  summary: AmbientRunSummary,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("brain_decision_runs")
    .insert({
      user_id: userId,
      run_type: decisionRunType(runType),
      input_summary: `${AMBIENT_RUN_POLICIES[runType].label}: maintenance pass`,
      candidate_ids: [],
      selected_ids: [],
      rejected_ids: [],
      model: "deterministic",
      raw_output: {
        ambient: { run_type: runType },
        summary,
        budget: summary.budget,
      },
    })
    .select("id")
    .single();
  if (error) {
    console.error("[ambient.log] failed", error);
    return null;
  }
  return (data as { id: string }).id;
}

async function readInventoryCounts(
  userId: string,
  supabase: SupabaseClient,
): Promise<{ active: number; holding: number }> {
  try {
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
    return { active: activeRes.count ?? 0, holding: holdingRes.count ?? 0 };
  } catch {
    return { active: 0, holding: 0 };
  }
}

async function readRecentLaneIds(userId: string, supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("brain_decision_runs")
      .select("raw_output")
      .eq("user_id", userId)
      .in("run_type", ["radar.refresh", "ambient.radar_discovery"])
      .order("created_at", { ascending: false })
      .limit(3);
    const ids = new Set<string>();
    for (const row of (data ?? []) as Array<{ raw_output: unknown }>) {
      for (const id of readLanesFromRawOutput(row.raw_output)) ids.add(id);
    }
    return Array.from(ids);
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
    .map((lane) => {
      if (!lane || typeof lane !== "object") return null;
      const id = (lane as Record<string, unknown>).id;
      return typeof id === "string" ? id : null;
    })
    .filter((id): id is string => Boolean(id));
}

function emptySkipped(
  runType: AmbientRunType,
  next?: string,
  budget: Record<string, unknown> = {},
): AmbientRunSummary {
  return {
    ok: true,
    skipped: true,
    reason: "cooldown",
    next_allowed_at: next,
    run_type: runType,
    candidates_found: 0,
    inserted: 0,
    updated: 0,
    shortlisted: 0,
    selected: 0,
    rejected: 0,
    expired: 0,
    promoted_today: 0,
    fallback_used: false,
    decision_run_id: null,
    budget,
    errors: [],
    source_plan_entries: 0,
    synthetic_moves: 0,
  };
}

function safeHome() {
  try {
    return getDefaultLocation();
  } catch {
    return null;
  }
}

// ── Evening Active Mode push ─────────────────────────────────────────────────

export type EveningPushSummary = {
  userId: string;
  sent: number;
  skipped?: string;
};

/**
 * Evening Active Mode. Daily maintenance runs at noon UTC; this is the
 * separate wind-down nudge. Fires a push only when (a) it is the user's local
 * evening (17:00–20:00), and (b) there is a fresh, strong Active Radar item
 * worth surfacing. Never sends a generic "check Jarvis" — silence is the
 * default. Never throws.
 */
export async function runEveningBriefPush(
  userId: string,
): Promise<EveningPushSummary> {
  try {
    if (!hasVapid()) return { userId, sent: 0, skipped: "vapid_not_configured" };

    const supabase = getSupabaseServiceClient();

    // 1. Timezone (profiles.timezone; default America/Chicago)
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();
    const timezone = profile?.timezone || "America/Chicago";

    // 2. Local-hour gate — only the 17:00–20:00 wind-down window
    const localHour = getLocalHour(new Date(), timezone);
    if (localHour < 17 || localHour > 20) {
      return { userId, sent: 0, skipped: `outside_window(${localHour}h)` };
    }

    // 3. Subscriptions
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId);
    const subscriptions = (subs ?? []) as PushSubscriptionRow[];
    if (subscriptions.length === 0) {
      return { userId, sent: 0, skipped: "no_subscriptions" };
    }

    // 4. Strongest fresh Active Radar item (shown, updated in last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: items } = await supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", userId)
      .eq("destination", "radar")
      .eq("status", "shown")
      .gte("updated_at", since)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(1);
    const top = ((items ?? []) as SurfacedItemRow[])[0];
    if (!top || !top.title) {
      return { userId, sent: 0, skipped: "no_worthy_items" };
    }

    // 5. Payload
    const briefing = readBriefingFromPayload(top.payload);
    const whyNow = briefing?.why_now?.trim();
    const body = whyNow ? `${top.title} — ${whyNow}` : top.title;
    const payload = { title: "Tonight on Jarvis", body, url: "/" };

    // 6. Send to every registered subscription
    let sent = 0;
    for (const sub of subscriptions) {
      await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      );
      sent += 1;
    }
    return { userId, sent };
  } catch (err) {
    console.error("[push.evening] failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { userId, sent: 0, skipped: "error" };
  }
}

function getLocalHour(date: Date, timeZone: string): number {
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone,
    }).format(date);
    const hour = parseInt(formatted, 10);
    return Number.isFinite(hour) ? hour % 24 : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}
