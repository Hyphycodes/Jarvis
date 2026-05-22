import "server-only";

import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { listIndexItems, rowToIndexedItem } from "@/lib/index/repo";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { buildBrainContext } from "@/lib/brain/context";
import { editBriefing } from "@/lib/brain/briefingEditor";
import {
  isMajorQualityFlag,
  mergeBriefingIntoPayload,
} from "@/lib/brain/briefingTypes";
import { evaluateActiveRadarItem } from "@/lib/intelligence/radarFrontRoom";
import { runCurator, summarizeContext } from "@/lib/brain/curator";
import { runCritic } from "@/lib/brain/critic";
import { shortlistByScore } from "@/lib/brain/router";
import type { BrainDecision, ScoredItem } from "@/lib/brain/types";
import type { IndexedItem } from "@/lib/index/types";
import type { SurfacedItemRow } from "@/lib/types/database";
import {
  RADAR_DEFAULT_SELECTED_LIMIT,
  RADAR_HARD_SELECTED_LIMIT,
  RADAR_SHORTLIST_LIMIT,
  RADAR_MIN_CONFIDENCE,
  RADAR_ACTIVE_ITEM_LIMIT,
  RADAR_STALE_SHOWN_DAYS,
  MAX_DINING_PER_REFRESH,
  MAX_EVENTS_PER_REFRESH,
  MAX_PRODUCTS_PER_REFRESH,
  MAX_NORTH_IDEAS_PER_REFRESH,
  RADAR_WEEKDAY_PAID_ITEM_LIMIT,
  RADAR_WEEKDAY_HIGH_EFFORT_LIMIT,
  HOLDING_ITEM_LIMIT,
  HOLDING_STALE_DAYS,
} from "@/lib/brain/constants";

const FALLBACK_HOLDING_CONFIDENCE_FLOOR = 0.45;
const MAX_BRIEFINGS_PER_REFRESH = 12;

export type RadarCurationResult = {
  shortlisted: number;
  decision: BrainDecision;
  appliedSelected: number;
  appliedRejected: number;
  decisionRunId: string | null;
};

/** Optional snapshot from the Taste Strategist + Curiosity Engine, logged
 *  into `brain_decision_runs.raw_output` for audit. The fields are loose
 *  on purpose — the schema lives in the strategist/curiosity modules. */
export type StrategySnapshot = {
  graph_summary?: unknown;
  lanes?: unknown;
  source_plan?: unknown;
  skipped_lane_ids?: string[];
  strategist_fallback_used?: boolean;
  strategist_reason?: string;
};

/** Lifecycle states a user has acted on — never overwritten by curation. */
const PROTECTED_STATUSES = new Set([
  "saved",
  "passed",
  "planned",
  "completed",
  "archived",
]);

export async function runRadarCuration(options: {
  maxShortlist?: number;
  maxSelected?: number;
  maxBriefings?: number;
  runType?: string;
  rawOutputExtra?: Record<string, unknown>;
  /** Optional snapshot from the Taste Strategist + Curiosity Engine.
   *  Logged into brain_decision_runs.raw_output for audit. */
  strategy?: StrategySnapshot;
} = {}): Promise<RadarCurationResult> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const context = await buildBrainContext();

  const now = new Date(context.now);

  // Pool: Radar items that are still in play.
  // Recently-passed items are excluded via context.recentActions filter below.
  const rawPool = await listIndexItems({
    destination: "radar",
    status: ["discovered", "shown"],
    limit: 120,
  });

  // Also pull from holding — items there can be promoted to radar if they
  // score well and timing has come.
  const holdingPool = await listIndexItems({
    destination: "holding",
    status: ["discovered", "shown"],
    limit: 40,
  });

  const fullPool = [...rawPool, ...holdingPool];

  // Enforce passed-item cooldown: skip items that were recently passed.
  // (The pool already excludes status='passed', but items reset to 'discovered'
  // after the cooldown window need no filtering — they're already in the pool.)
  // Nothing to do here since passed items have status='passed' (not in pool).
  // Instead, filter by recently-passed signals from context.recentActions.
  const recentlyPassedTitles = new Set(
    context.recentActions
      .filter((a) => {
        // We don't have a timestamp on recentActions yet — skip that refinement.
        // The pool already excludes status='passed'. This guard is an extra
        // safety net for items that were reset to discovered too quickly.
        return a.status === "passed";
      })
      .map((a) => a.title),
  );

  const pool = fullPool.filter(
    (item) => !recentlyPassedTitles.has(item.title),
  );

  const recentPassCategories = context.recentActions
    .filter((a) => a.status === "passed")
    .map((a) => a.category)
    .filter((c): c is string => typeof c === "string");

  const shortlist: ScoredItem[] = shortlistByScore(pool, {
    homeLat: context.homeLat,
    homeLng: context.homeLng,
    currentWeather: context.weather
      ? { temperatureF: context.weather.temperatureF }
      : undefined,
    northTags: context.northTags,
    recentPassCategories,
    maxItems: options.maxShortlist ?? RADAR_SHORTLIST_LIMIT,
  });

  const maxSelected = Math.min(
    options.maxSelected ?? RADAR_DEFAULT_SELECTED_LIMIT,
    RADAR_HARD_SELECTED_LIMIT,
  );

  const curated = await runCurator({
    context,
    shortlist,
    maxSelected,
  });

  const critiqued = await runCritic({
    context,
    decision: curated,
    shortlist,
  });

  const briefed = await attachBriefings(
    critiqued,
    shortlist,
    context,
    options.maxBriefings ?? MAX_BRIEFINGS_PER_REFRESH,
  );

  // Post-critique gates (code-enforced, not just prompt hints)
  const qualityGated = enforceBriefingQuality(briefed, shortlist);
  const gated = enforceGates(qualityGated, shortlist, now);
  if (gated.fallbackUsed) {
    console.warn("[brain.curation] fallback brain applied", {
      fallbackReason: gated.fallbackReason ?? gated.notes,
      shortlisted: shortlist.length,
      selected: gated.selected.length,
      rejected: gated.rejected.length,
    });
  }

  const { selectedApplied, rejectedApplied } = await applyDecision(
    owner.id,
    gated,
    pool,
  );

  // After applying the current selection, enforce the Active Radar inventory cap.
  // Items beyond the hard limit are rotated into Holding or reset to discovered.
  await enforceActiveRadarCap(owner.id);

  // Prune stale Holding items that have aged out.
  await pruneStaleHolding(owner.id);

  const decisionRunId = await logDecisionRun({
    userId: owner.id,
    runType: options.runType ?? "radar.refresh",
    inputSummary: summarizeContext(context),
    candidateIds: shortlist.map((s) => s.item.id),
    selectedIds: gated.selected.map((s) => s.itemId),
    rejectedIds: gated.rejected.map((r) => r.itemId),
    model: gated.fallbackUsed || !hasAnthropic() ? "deterministic" : "claude",
    rawOutput: {
      decision: gated,
      strategy: options.strategy ?? null,
      fallback_reason: gated.fallbackReason,
      ...(options.rawOutputExtra ?? {}),
    } as unknown as BrainDecision,
  });

  return {
    shortlisted: shortlist.length,
    decision: gated,
    appliedSelected: selectedApplied,
    appliedRejected: rejectedApplied,
    decisionRunId,
  };
}

// ── Post-critique enforcement gates ─────────────────────────────────────────

/**
 * Code-enforced gates applied after the Critic returns.
 * These are not suggestions — they always run regardless of what Claude decided.
 *
 * 1. Confidence floor: items < RADAR_MIN_CONFIDENCE → discovered
 * 2. Category quotas: excess items → discovered
 * 3. Weekday energy limits (Mon–Thu): paid / high-effort items capped
 */
function enforceGates(
  decision: BrainDecision,
  shortlist: ScoredItem[],
  now: Date,
): BrainDecision {
  const scoreByItemId = new Map(shortlist.map((s) => [s.item.id, s]));
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 4;

  let selected = [...decision.selected];
  const extraRejected: BrainDecision["rejected"] = [];

  // 1. Confidence floor
  const belowFloor = selected.filter((s) => {
    if (s.confidence >= RADAR_MIN_CONFIDENCE) return false;
    return !(
      decision.fallbackUsed &&
      s.destination === "holding" &&
      s.confidence >= FALLBACK_HOLDING_CONFIDENCE_FLOOR
    );
  });
  selected = selected.filter((s) => {
    if (s.confidence >= RADAR_MIN_CONFIDENCE) return true;
    return (
      decision.fallbackUsed &&
      s.destination === "holding" &&
      s.confidence >= FALLBACK_HOLDING_CONFIDENCE_FLOOR
    );
  });
  for (const s of belowFloor) {
    extraRejected.push({
      itemId: s.itemId,
      reason: `Below confidence floor (${s.confidence.toFixed(2)} < ${RADAR_MIN_CONFIDENCE})`,
      suggestedStatus: "discovered",
    });
  }

  // 2. Category quotas
  const quotaCounters = {
    dining: 0,
    events: 0,
    product: 0,
    north: 0,
  };

  const quotaLimited: typeof decision.selected = [];
  for (const s of selected) {
    const scored = scoreByItemId.get(s.itemId);
    const category = scored?.item.category ?? "";
    const type = scored?.item.type ?? "";
    const tags = scored?.item.tags ?? [];

    if ((category === "dining" || type === "restaurant") && s.destination === "radar") {
      if (quotaCounters.dining >= MAX_DINING_PER_REFRESH) {
        // Over-quota dining → holding instead of radar
        quotaLimited.push({ ...s, destination: "holding" });
        continue;
      }
      quotaCounters.dining++;
    } else if ((category === "events" || type === "event") && s.destination === "radar") {
      if (quotaCounters.events >= MAX_EVENTS_PER_REFRESH) {
        quotaLimited.push({ ...s, destination: "holding" });
        continue;
      }
      quotaCounters.events++;
    } else if ((category === "style" || type === "product") && s.destination === "radar") {
      if (quotaCounters.product >= MAX_PRODUCTS_PER_REFRESH) {
        quotaLimited.push({ ...s, destination: "holding" });
        continue;
      }
      quotaCounters.product++;
    } else if (tags.includes("north") && s.destination === "radar") {
      if (quotaCounters.north >= MAX_NORTH_IDEAS_PER_REFRESH) {
        quotaLimited.push({ ...s, destination: "holding" });
        continue;
      }
      quotaCounters.north++;
    }

    quotaLimited.push(s);
  }
  selected = quotaLimited;

  // 3. Weekday limits
  if (isWeekday) {
    let paidCount = 0;
    let effortCount = 0;
    const weekdayFiltered: typeof decision.selected = [];

    for (const s of selected) {
      if (s.destination === "holding") {
        weekdayFiltered.push(s);
        continue;
      }
      const scored = scoreByItemId.get(s.itemId);
      const tags = scored?.item.tags ?? [];
      const isPaid = tags.includes("paid") || tags.includes("ticketed");
      const isHighEffort = tags.includes("high-effort") || tags.includes("all-day");

      if (isPaid) {
        if (paidCount >= RADAR_WEEKDAY_PAID_ITEM_LIMIT) {
          weekdayFiltered.push({ ...s, destination: "holding" });
          continue;
        }
        paidCount++;
      }
      if (isHighEffort) {
        if (effortCount >= RADAR_WEEKDAY_HIGH_EFFORT_LIMIT) {
          weekdayFiltered.push({ ...s, destination: "holding" });
          continue;
        }
        effortCount++;
      }
      weekdayFiltered.push(s);
    }
    selected = weekdayFiltered;
  }

  return {
    selected,
    rejected: [...decision.rejected, ...extraRejected],
    notes: decision.notes,
    fallbackUsed: decision.fallbackUsed,
    fallbackReason: decision.fallbackReason,
  };
}

async function attachBriefings(
  decision: BrainDecision,
  shortlist: ScoredItem[],
  context: Awaited<ReturnType<typeof buildBrainContext>>,
  maxBriefings: number,
): Promise<BrainDecision> {
  const scoreByItemId = new Map(shortlist.map((s) => [s.item.id, s]));
  const rejectionReasonByItemId = new Map(
    decision.rejected.map((r) => [r.itemId, r.reason]),
  );
  const selected = [];
  let generated = 0;

  for (const sel of decision.selected) {
    const scored = scoreByItemId.get(sel.itemId);
    if (!scored || generated >= maxBriefings) {
      selected.push(sel);
      continue;
    }
    const result = await editBriefing({
      context,
      scored,
      selection: sel,
      criticReason: rejectionReasonByItemId.get(sel.itemId),
    });
    if (!result.reused) generated++;
    selected.push({
      ...sel,
      briefing: result.briefing,
      briefingMeta: result.meta,
    });
  }

  return {
    ...decision,
    selected,
    notes: [
      decision.notes,
      `Briefing Editor applied to ${generated} candidate${generated === 1 ? "" : "s"}.`,
    ].filter(Boolean).join(" | "),
  };
}

function enforceBriefingQuality(
  decision: BrainDecision,
  shortlist: ScoredItem[],
): BrainDecision {
  const scoreByItemId = new Map(shortlist.map((s) => [s.item.id, s]));
  const selected: BrainDecision["selected"] = [];
  const rejected: BrainDecision["rejected"] = [...decision.rejected];
  const notes: string[] = [];

  for (const sel of decision.selected) {
    const briefing = sel.briefing;
    if (!briefing) {
      selected.push(sel.destination === "radar" ? { ...sel, destination: "holding" } : sel);
      notes.push(`${sel.itemId}: no briefing, moved to Holding`);
      continue;
    }

    const hasCoreCopy =
      briefing.one_line.trim().length > 0 && briefing.jarvis_take.trim().length > 0;
    const majorFlags = briefing.quality_flags.filter(isMajorQualityFlag);
    const scored = scoreByItemId.get(sel.itemId);
    const frontRoom = scored
      ? evaluateActiveRadarItem(scored.item, briefing)
      : null;
    const terminal =
      briefing.suggested_destination === "archived" ||
      briefing.suggested_destination === "discovered" ||
      briefing.best_next_action === "ignore" ||
      briefing.best_next_action === "pass";

    if (terminal) {
      rejected.push({
        itemId: sel.itemId,
        reason: `Briefing gate: ${briefing.best_next_action}; ${briefing.jarvis_take}`,
        suggestedStatus:
          briefing.suggested_destination === "archived" ? "archived" : "discovered",
      });
      notes.push(`${sel.itemId}: briefing rejected`);
      continue;
    }

    const nextConfidence = Math.min(sel.confidence, briefing.confidence);
    let destination = sel.destination;
    if (briefing.suggested_destination === "holding") destination = "holding";
    if (briefing.suggested_destination === "radar" && destination !== "holding") {
      destination = "radar";
    }

    if (
      destination === "radar" &&
      (!hasCoreCopy ||
        nextConfidence < RADAR_MIN_CONFIDENCE ||
        majorFlags.length > 0 ||
        (frontRoom && !frontRoom.allowed))
    ) {
      const frontRoomDestination = frontRoom?.suggestedDestination;
      if (frontRoomDestination === "archived" || frontRoomDestination === "discovered") {
        rejected.push({
          itemId: sel.itemId,
          reason: `Front-room gate: ${frontRoom?.reason ?? "not active-ready"}`,
          suggestedStatus: frontRoomDestination,
        });
        notes.push(`${sel.itemId}: front-room rejected`);
        continue;
      }
      if (
        briefing.confidence >= FALLBACK_HOLDING_CONFIDENCE_FLOOR &&
        briefing.best_next_action !== "ignore" &&
        briefing.best_next_action !== "pass"
      ) {
        selected.push({
          ...sel,
          destination: "holding",
          confidence: nextConfidence,
          reason: briefing.why_it_matters,
          displayAngle: briefing.jarvis_take,
          tags: [
            ...(briefing.cleaned_tags.length > 0 ? briefing.cleaned_tags : sel.tags),
            ...(frontRoom?.flags ?? []),
          ],
        });
        notes.push(`${sel.itemId}: downgraded to Holding (${frontRoom?.reason ?? "briefing gate"})`);
      } else {
        rejected.push({
          itemId: sel.itemId,
          reason: `Briefing gate: ${majorFlags.join(", ") || "not decision-ready"}`,
          suggestedStatus: "discovered",
        });
        notes.push(`${sel.itemId}: briefing rejected`);
      }
      continue;
    }

    selected.push({
      ...sel,
      destination,
      confidence: nextConfidence,
      reason: briefing.why_it_matters,
      displayAngle: briefing.jarvis_take,
      tags: [
        ...(briefing.cleaned_tags.length > 0 ? briefing.cleaned_tags : sel.tags),
        ...(frontRoom?.purposeLabel ? [frontRoom.purposeLabel] : []),
      ],
    });
  }

  return {
    ...decision,
    selected,
    rejected,
    notes: [decision.notes, notes.length ? `Briefing gate: ${notes.join("; ")}` : ""]
      .filter(Boolean)
      .join(" | "),
  };
}

// ── Apply decision ────────────────────────────────────────────────────────────

async function applyDecision(
  userId: string,
  decision: BrainDecision,
  pool: IndexedItem[],
): Promise<{ selectedApplied: number; rejectedApplied: number }> {
  const supabase = await getServerSupabase();
  const poolById = new Map(pool.map((p) => [p.id, p]));
  let selectedApplied = 0;
  let rejectedApplied = 0;

  for (const sel of decision.selected) {
    const existing = poolById.get(sel.itemId);
    if (!existing || PROTECTED_STATUSES.has(existing.status)) continue;

    const newStatus = sel.destination === "holding" ? "discovered" : "shown";
    const reasons = uniq([
      ...existing.reasons,
      sel.reason,
      sel.displayAngle,
    ]).filter(Boolean);
    const tags = uniq([...existing.tags, ...sel.tags]).filter(Boolean);
    const payload = sel.briefing
      ? mergeBriefingIntoPayload(existing.rawPayload, sel.briefing, sel.briefingMeta)
      : existing.rawPayload;

    const { error } = await supabase
      .from("surfaced_items")
      .update({
        status: newStatus,
        destination: sel.destination,
        reasons,
        tags,
        score: sel.confidence,
        payload,
      })
      .eq("id", sel.itemId)
      .eq("user_id", userId);

    if (!error) selectedApplied++;
  }

  for (const rej of decision.rejected) {
    const existing = poolById.get(rej.itemId);
    if (!existing || PROTECTED_STATUSES.has(existing.status)) continue;
    if (
      rej.suggestedStatus !== "archived" &&
      rej.suggestedStatus !== "discovered"
    ) {
      continue;
    }
    const { error } = await supabase
      .from("surfaced_items")
      .update({ status: rej.suggestedStatus })
      .eq("id", rej.itemId)
      .eq("user_id", userId);
    if (!error) rejectedApplied++;
  }

  return { selectedApplied, rejectedApplied };
}

// ── Active Radar inventory cap ────────────────────────────────────────────────

/**
 * After a curation run, if the number of "shown" items with destination="radar"
 * exceeds RADAR_ACTIVE_ITEM_LIMIT, rotate the oldest/lowest-scored ones to
 * Holding (destination="holding") or reset them to "discovered".
 *
 * Items with PROTECTED_STATUSES are always left alone.
 */
async function enforceActiveRadarCap(userId: string): Promise<void> {
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("surfaced_items")
      .select("id, score, updated_at, status, tags")
      .eq("user_id", userId)
      .eq("destination", "radar")
      .eq("status", "shown")
      .order("score", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error || !data) return;

    const shown = data as Array<{
      id: string;
      score: number | null;
      updated_at: string;
      status: string;
      tags: string[];
    }>;

    if (shown.length <= RADAR_ACTIVE_ITEM_LIMIT) return;

    // Items beyond the cap, sorted oldest/lowest-scored last
    const toRotate = shown.slice(RADAR_ACTIVE_ITEM_LIMIT);
    const staleCutoff = new Date(
      Date.now() - RADAR_STALE_SHOWN_DAYS * 24 * 60 * 60 * 1000,
    );

    for (const item of toRotate) {
      const isStale = new Date(item.updated_at) < staleCutoff;
      const score = item.score ?? 0;

      // Strong items (score >= 0.5) that aren't stale → Holding
      // Everything else → reset to discovered (back in pool for next curation)
      const newDestination = score >= 0.5 && !isStale ? "holding" : "radar";
      const newStatus = "discovered";

      await supabase
        .from("surfaced_items")
        .update({ status: newStatus, destination: newDestination })
        .eq("id", item.id)
        .eq("user_id", userId);
    }
  } catch (err) {
    console.error("[brain.cap] enforceActiveRadarCap failed", err);
  }
}

// ── Holding pruner ────────────────────────────────────────────────────────────

/**
 * Archive Holding items that have been sitting there longer than HOLDING_STALE_DAYS,
 * and trim the Holding count to HOLDING_ITEM_LIMIT (oldest first).
 */
async function pruneStaleHolding(userId: string): Promise<void> {
  try {
    const supabase = await getServerSupabase();
    const staleCutoff = new Date(
      Date.now() - HOLDING_STALE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Archive stale holding items
    await supabase
      .from("surfaced_items")
      .update({ status: "archived" })
      .eq("user_id", userId)
      .eq("destination", "holding")
      .in("status", ["discovered", "shown"])
      .lt("updated_at", staleCutoff);

    // Trim to HOLDING_ITEM_LIMIT (oldest → archive)
    const { data } = await supabase
      .from("surfaced_items")
      .select("id")
      .eq("user_id", userId)
      .eq("destination", "holding")
      .in("status", ["discovered", "shown"])
      .order("updated_at", { ascending: true });

    const ids = (data ?? []).map((r: { id: string }) => r.id);
    if (ids.length > HOLDING_ITEM_LIMIT) {
      const toArchive = ids.slice(0, ids.length - HOLDING_ITEM_LIMIT);
      if (toArchive.length > 0) {
        await supabase
          .from("surfaced_items")
          .update({ status: "archived" })
          .eq("user_id", userId)
          .in("id", toArchive);
      }
    }
  } catch (err) {
    console.error("[brain.cap] pruneStaleHolding failed", err);
  }
}

// ── Brain run logger ──────────────────────────────────────────────────────────

async function logDecisionRun(input: {
  userId: string;
  runType: string;
  inputSummary: string;
  candidateIds: string[];
  selectedIds: string[];
  rejectedIds: string[];
  model: string;
  rawOutput: BrainDecision;
}): Promise<string | null> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("brain_decision_runs")
    .insert({
      user_id: input.userId,
      run_type: input.runType,
      input_summary: input.inputSummary,
      candidate_ids: input.candidateIds,
      selected_ids: input.selectedIds,
      rejected_ids: input.rejectedIds,
      model: input.model,
      raw_output: input.rawOutput as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[brain.log] failed", error);
    return null;
  }
  return (data as { id: string }).id;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export async function listRadarPool(): Promise<IndexedItem[]> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", owner.id)
    .eq("destination", "radar")
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as SurfacedItemRow[]).map(rowToIndexedItem);
}
