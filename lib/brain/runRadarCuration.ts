import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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
import { enrichRadarItem } from "@/lib/intelligence/core";
import {
  isStrongRadarItem,
  mergeRadarIntelligencePayload,
} from "@/lib/intelligence/radarCurator";
import { runCurator, summarizeContext } from "@/lib/brain/curator";
import { runCritic } from "@/lib/brain/critic";
import { shortlistByScore } from "@/lib/brain/router";
import { getLaneVelocity } from "@/lib/north/laneVelocity";
import { inferRecentCadence } from "@/lib/brain/lifeCadence";
import {
  buildIntelligenceReason,
  sourceStrengthFromConfidence,
} from "@/lib/brain/intelligenceReason";
import {
  buildContextTraceSummary,
  safeWriteIntelligenceTrace,
} from "@/lib/brain/intelligenceTrace";
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

  // Pre-fetch places library for curator/critic known-place injection
  const { data: libraryEntries } = await supabase
    .from("places_library")
    .select("*")
    .eq("user_id", owner.id)
    .order("last_surfaced_at", { ascending: false, nullsFirst: false })
    .limit(200);

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

  const recentPasses = context.recentActions.filter((a) => a.status === "passed");
  const pool = fullPool.filter((item) => !isNearRecentPass(item, recentPasses, recentlyPassedTitles));

  const recentPassCategories = context.recentActions
    .filter((a) => a.status === "passed")
    .map((a) => a.category)
    .filter((c): c is string => typeof c === "string");

  const velocityProfile = getLaneVelocity(
    context.recentSignals,
    now,
    context.founder.timezone,
  );

  const scoredShortlist: ScoredItem[] = shortlistByScore(pool, {
    homeLat: context.homeLat,
    homeLng: context.homeLng,
    currentWeather: context.weather
      ? { temperatureF: context.weather.temperatureF }
      : undefined,
    northTags: context.northTags,
    recentPassCategories,
    avoidKeywords: context.founder.avoidKeywords,
    dealbreakers: context.founder.dealbreakers,
    maxItems: options.maxShortlist ?? RADAR_SHORTLIST_LIMIT,
    velocityProfile,
  });

  // Cross-source confidence pass — boost items named by multiple trusted
  // sources. Runs before the article filter so boosted scores can rescue
  // borderline items that might otherwise fall below the shortlist threshold.
  const confidenceAdjusted = await applySourceConfidence(
    scoredShortlist,
    owner.id,
    supabase,
  );

  // Hard-block article/listicle items before they reach the Curator.
  // These are not places — they're editorial roundups that slipped
  // normalization. An empty Radar is correct. Junk on Radar is not.
  const shortlist: ScoredItem[] = confidenceAdjusted.filter(
    (s) => !isArticleItem(s.item),
  );

  // 6.3 — Cadence-aware aperture
  const cadence = await inferRecentCadence({ userId: owner.id, supabase });
  const cadenceMax =
    cadence.intensity === "heavy" ? 1 :
    cadence.intensity === "moderate" ? 3 : 2;

  const maxSelected = Math.min(
    options.maxSelected ?? Math.min(cadenceMax, RADAR_DEFAULT_SELECTED_LIMIT),
    RADAR_HARD_SELECTED_LIMIT,
  );

  const curated = await runCurator({
    context,
    shortlist,
    maxSelected,
    libraryEntries: (libraryEntries ?? []) as import("@/lib/types/database").PlacesLibraryRow[],
  });

  const critiqued = await runCritic({
    context,
    decision: curated,
    shortlist,
    libraryEntries: (libraryEntries ?? []) as import("@/lib/types/database").PlacesLibraryRow[],
  });

  const briefed = await attachBriefings(
    critiqued,
    shortlist,
    context,
    options.maxBriefings ?? MAX_BRIEFINGS_PER_REFRESH,
  );

  // Post-critique gates (code-enforced, not just prompt hints)
  const qualityGated = enforceBriefingQuality(briefed, shortlist, context);

  // 6.2 — Occasion type saturation check
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentByOccasion } = await supabase
    .from("surfaced_items")
    .select("occasion_type, location_name, tags")
    .eq("user_id", owner.id)
    .gte("updated_at", sevenDaysAgo)
    .not("occasion_type", "is", null);
  const occasionSaturated = enforceOccasionSaturation(
    qualityGated,
    shortlist,
    (recentByOccasion ?? []) as Array<{ occasion_type: string | null; location_name: string | null; tags: string[] }>,
  );

  // 6.4 — Novelty floor enforcement
  const noveltyEnforced = enforceNoveltyFloor(occasionSaturated, shortlist, libraryEntries ?? []);

  const gated = enforceGates(noveltyEnforced, shortlist, now);
  if (gated.fallbackUsed) {
    console.warn("[brain.curation] fallback brain applied", {
      fallbackReason: gated.fallbackReason ?? gated.notes,
      shortlisted: shortlist.length,
      selected: gated.selected.length,
      rejected: gated.rejected.length,
    });
  }

  const intelligenceGated = attachRadarIntelligence(
    gated,
    shortlist,
    context,
    velocityProfile.timeContext,
  );

  const { selectedApplied, rejectedApplied } = await applyDecision(
    owner.id,
    intelligenceGated,
    pool,
    shortlist,
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
    selectedIds: intelligenceGated.selected.map((s) => s.itemId),
    rejectedIds: intelligenceGated.rejected.map((r) => r.itemId),
    model: intelligenceGated.fallbackUsed || !hasAnthropic() ? "deterministic" : "claude",
    rawOutput: {
      decision: intelligenceGated,
      strategy: options.strategy ?? null,
      fallback_reason: intelligenceGated.fallbackReason,
      ...(options.rawOutputExtra ?? {}),
    } as unknown as BrainDecision,
  });
  await safeWriteIntelligenceTrace({
    userId: owner.id,
    route: "lib/brain/runRadarCuration.runRadarCuration",
    surface: "radar",
    decisionType: "curation",
    contextSummary: buildContextTraceSummary(context),
    reasoning: buildIntelligenceReason({
      summary: `Radar curation selected ${intelligenceGated.selected.length} and rejected ${intelligenceGated.rejected.length}.`,
      contextFactors: [
        intelligenceGated.notes,
        options.strategy?.strategist_reason,
        `Shortlist: ${shortlist.length}`,
      ],
      behaviorInfluence: recentPassCategories.map((category) => `Recent pass category: ${category}`),
      confidence: intelligenceGated.selected[0]?.confidence,
      sourceStrength: sourceStrengthFromConfidence(intelligenceGated.selected[0]?.confidence),
    }),
    candidatesConsidered: shortlist.slice(0, 20).map((entry) => ({
      id: entry.item.id,
      title: entry.item.title,
      score: entry.score,
      northAlignment: entry.northAlignment,
    })),
    selectedCandidate: intelligenceGated.selected.slice(0, 8).map((selection) => ({
      itemId: selection.itemId,
      destination: selection.destination,
      confidence: selection.confidence,
      reason: selection.reason,
    })),
    rejectedCandidates: intelligenceGated.rejected.slice(0, 12).map((rejection) => ({
      itemId: rejection.itemId,
      reason: rejection.reason,
      suggestedStatus: rejection.suggestedStatus,
    })),
    northAlignment: shortlist
      .filter((entry) => entry.northAlignment?.score)
      .slice(0, 8)
      .map((entry) => ({
        itemId: entry.item.id,
        ...entry.northAlignment,
      })),
    behaviorInfluence: { recent_pass_categories: recentPassCategories },
    confidence: intelligenceGated.selected[0]?.confidence ?? null,
    outcome: decisionRunId ? `brain_decision_run:${decisionRunId}` : "logged_without_run_id",
  });

  return {
    shortlisted: shortlist.length,
    decision: intelligenceGated,
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

  // Tag each selection with its original array index so we can reassemble in
  // order after concurrent generation.
  type IndexedSel = { sel: BrainDecision["selected"][number]; idx: number };

  const toGenerate: IndexedSel[] = [];
  decision.selected.forEach((sel, idx) => {
    if (scoreByItemId.has(sel.itemId)) toGenerate.push({ sel, idx });
  });

  // Cap at maxBriefings — items beyond the cap pass through unchanged
  // (same behaviour as the old sequential loop's `generated >= maxBriefings` guard).
  const toBrief = toGenerate.slice(0, maxBriefings);

  // Run up to 4 briefing calls concurrently. editBriefing is stateless so
  // concurrent calls are safe.
  type BriefResult = { sel: BrainDecision["selected"][number]; idx: number; reused: boolean };
  const briefed = await withConcurrency<IndexedSel, BriefResult>(
    toBrief,
    4,
    async ({ sel, idx }) => {
      const scored = scoreByItemId.get(sel.itemId)!;
      const result = await editBriefing({
        context,
        scored,
        selection: sel,
        criticReason: rejectionReasonByItemId.get(sel.itemId),
      });
      return {
        sel: { ...sel, briefing: result.briefing, briefingMeta: result.meta },
        idx,
        reused: result.reused,
      };
    },
  );

  const generated = briefed.filter((r) => !r.reused).length;

  // Reconstruct selected in original order. Items that weren't briefed
  // (no scored entry, or over the maxBriefings cap) are left as-is via the
  // `?? sel` fallback.
  const enrichedByIdx = new Map(briefed.map((r) => [r.idx, r.sel]));
  const selected = decision.selected.map((sel, i) => enrichedByIdx.get(i) ?? sel);

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
  context: Awaited<ReturnType<typeof buildBrainContext>>,
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
      ? evaluateActiveRadarItem(scored.item, briefing, context)
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
          radarDecision: frontRoom?.council,
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
      radarDecision: frontRoom?.council,
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

// ── 6.2 Occasion type saturation ─────────────────────────────────────────────

function enforceOccasionSaturation(
  decision: BrainDecision,
  shortlist: ScoredItem[],
  recentByOccasion: Array<{ occasion_type: string | null; location_name: string | null; tags: string[] }>,
): BrainDecision {
  const scoreByItemId = new Map(shortlist.map((s) => [s.item.id, s]));
  const selected: BrainDecision["selected"] = [];
  const notes: string[] = [];

  for (const sel of decision.selected) {
    const occasionType = sel.briefing?.occasion_type;
    if (!occasionType || sel.destination !== "radar") {
      selected.push(sel);
      continue;
    }
    const sameType = recentByOccasion.filter((r) => r.occasion_type === occasionType);
    if (sameType.length < 1) {
      selected.push(sel);
      continue;
    }
    const scored = scoreByItemId.get(sel.itemId);
    const neighborhood = scored?.item.tags.find((t) => t.startsWith("neighborhood:")) ??
      scored?.item.locationName ?? null;
    const differentNeighborhood = sameType.every((r) => {
      const rNbhd = r.location_name;
      return rNbhd !== neighborhood;
    });
    if (differentNeighborhood) {
      selected.push(sel);
    } else {
      selected.push({ ...sel, destination: "holding" });
      notes.push(`${sel.itemId}: occasion_type saturation (${occasionType}) → holding`);
    }
  }

  return {
    ...decision,
    selected,
    notes: [decision.notes, notes.length ? `Occasion saturation: ${notes.join("; ")}` : ""]
      .filter(Boolean).join(" | "),
  };
}

// ── 6.4 Novelty floor ────────────────────────────────────────────────────────

function enforceNoveltyFloor(
  decision: BrainDecision,
  shortlist: ScoredItem[],
  libraryEntries: import("@/lib/types/database").PlacesLibraryRow[],
): BrainDecision {
  const radarSelected = decision.selected.filter((s) => s.destination === "radar");
  if (radarSelected.length <= 1) return decision;

  const scoreByItemId = new Map(shortlist.map((s) => [s.item.id, s]));
  const libraryByName = new Map(libraryEntries.map((e) => [e.name?.toLowerCase() ?? "", e]));

  function getTimesSurfaced(sel: BrainDecision["selected"][number]): number {
    const scored = scoreByItemId.get(sel.itemId);
    const name = (scored?.item.locationName ?? scored?.item.title ?? "").toLowerCase();
    const entry = libraryByName.get(name);
    return entry?.times_surfaced ?? 0;
  }

  const neverSurfacedCount = radarSelected.filter((s) => getTimesSurfaced(s) === 0).length;
  const ratio = neverSurfacedCount / radarSelected.length;

  if (ratio >= 0.6) return decision;

  // Demote most-seen items until ratio clears 0.6
  const sorted = [...radarSelected].sort((a, b) => getTimesSurfaced(b) - getTimesSurfaced(a));
  const demotedIds = new Set<string>();
  let remaining = [...sorted];

  while (
    remaining.length > 1 &&
    remaining.filter((s) => getTimesSurfaced(s) === 0).length / remaining.length < 0.6
  ) {
    const demoted = remaining.shift();
    if (demoted) demotedIds.add(demoted.itemId);
  }

  const notes: string[] = [];
  const selected = decision.selected.map((sel) => {
    if (demotedIds.has(sel.itemId)) {
      notes.push(`${sel.itemId}: novelty floor → holding`);
      return { ...sel, destination: "holding" as const };
    }
    return sel;
  });

  return {
    ...decision,
    selected,
    notes: [decision.notes, notes.length ? `Novelty floor: ${notes.join("; ")}` : ""]
      .filter(Boolean).join(" | "),
  };
}

function attachRadarIntelligence(
  decision: BrainDecision,
  shortlist: ScoredItem[],
  context: Awaited<ReturnType<typeof buildBrainContext>>,
  velocityTimeContext?: string,
): BrainDecision {
  const scoreByItemId = new Map(shortlist.map((s) => [s.item.id, s]));
  const selected: BrainDecision["selected"] = [];
  const rejected: BrainDecision["rejected"] = [...decision.rejected];
  const notes: string[] = [];
  // Spread velocityTimeContext into the JarvisContext so judgeSignal can
  // forward it to the Decision Council's occasion confidence floor logic.
  const enrichContext = velocityTimeContext
    ? { ...context, velocityTimeContext }
    : context;

  for (const sel of decision.selected) {
    const scored = scoreByItemId.get(sel.itemId);
    if (!scored) {
      selected.push(sel);
      continue;
    }
    const item: IndexedItem = {
      ...scored.item,
      briefing: sel.briefing ?? scored.item.briefing,
      score: sel.confidence,
      tags: uniq([...scored.item.tags, ...sel.tags]),
      reasons: uniq([...scored.item.reasons, sel.reason, sel.displayAngle]).filter(Boolean),
    };
    const radarIntelligence = enrichRadarItem({ item, context: enrichContext });
    let destination = sel.destination;

    if (destination === "radar" && !isStrongRadarItem(radarIntelligence)) {
      const admission = radarIntelligence.decision.admission;
      if (admission === "archive" || admission === "discovered") {
        rejected.push({
          itemId: sel.itemId,
          reason:
            radarIntelligence.decision.rejection_reason ??
            `Radar hard gate: ${radarIntelligence.decision.negative_flags.join(", ") || "below quality floor"}`,
          suggestedStatus: admission === "archive" ? "archived" : "discovered",
        });
        notes.push(`${sel.itemId}: Radar hard gate rejected`);
        continue;
      }
      destination = "holding";
      notes.push(`${sel.itemId}: Radar hard gate moved to Holding`);
    }

    selected.push({
      ...sel,
      destination,
      confidence: Math.min(sel.confidence, radarIntelligence.score),
      reason: radarIntelligence.reasonSurfaced,
      displayAngle: radarIntelligence.strongestAngle,
      radarDecision: radarIntelligence.decision,
      radarIntelligence,
      tags: uniq([
        ...sel.tags,
        radarIntelligence.vibe,
        radarIntelligence.decision.purpose_label,
        radarIntelligence.diversityGroup,
      ]).filter(Boolean),
    });
  }

  return {
    ...decision,
    selected,
    rejected,
    notes: [decision.notes, notes.length ? `Radar intelligence: ${notes.join("; ")}` : ""]
      .filter(Boolean)
      .join(" | "),
  };
}

// ── Apply decision ────────────────────────────────────────────────────────────

async function applyDecision(
  userId: string,
  decision: BrainDecision,
  pool: IndexedItem[],
  shortlist: ScoredItem[],
): Promise<{ selectedApplied: number; rejectedApplied: number }> {
  const supabase = await getServerSupabase();
  const poolById = new Map(pool.map((p) => [p.id, p]));
  const scoreByItemId = new Map(shortlist.map((entry) => [entry.item.id, entry]));
  let selectedApplied = 0;
  let rejectedApplied = 0;

  for (const sel of decision.selected) {
    const existing = poolById.get(sel.itemId);
    if (!existing || PROTECTED_STATUSES.has(existing.status)) continue;
    const scored = scoreByItemId.get(sel.itemId);

    const newStatus = sel.destination === "holding" ? "discovered" : "shown";
    const reasons = uniq([
      ...existing.reasons,
      sel.reason,
      sel.displayAngle,
    ]).filter(Boolean);
    const tags = uniq([...existing.tags, ...sel.tags]).filter(Boolean);
    let payload = sel.briefing
      ? mergeBriefingIntoPayload(existing.rawPayload, sel.briefing, sel.briefingMeta)
      : existing.rawPayload;
    if (sel.radarDecision) {
      payload = mergeObjectPayload(payload, { radar_decision: sel.radarDecision });
    }
    if (sel.radarIntelligence) {
      payload = mergeRadarIntelligencePayload(payload, sel.radarIntelligence);
    }
    payload = mergeObjectPayload(payload, {
      intelligence_reason: buildIntelligenceReason({
        summary: sel.displayAngle || sel.reason,
        contextFactors: [sel.reason, sel.radarDecision?.best_move],
        northAlignment: sel.radarIntelligence?.northAlignment ?? scored?.northAlignment,
        behaviorInfluence:
          scored?.reasons.filter((reason) => /passed|saved|previously/i.test(reason)) ?? [],
        sourceStrength: sourceStrengthFromConfidence(sel.confidence),
        confidence: sel.confidence,
      }),
    });

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

/**
 * Runs `fn` over `items` with at most `limit` concurrent calls at a time.
 * Processes in chunks: each chunk fires simultaneously, then the next chunk
 * starts. This keeps concurrency bounded without needing an external semaphore.
 */
async function withConcurrency<TIn, TOut>(
  items: TIn[],
  limit: number,
  fn: (item: TIn) => Promise<TOut>,
): Promise<TOut[]> {
  const results: TOut[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

function isNearRecentPass(
  item: IndexedItem,
  recentPasses: Awaited<ReturnType<typeof buildBrainContext>>["recentActions"],
  exactTitles: Set<string>,
): boolean {
  if (exactTitles.has(item.title)) return true;
  const title = normalizeTitle(item.title);
  const category = item.category ?? item.type;
  return recentPasses.some((passed) => {
    const passedTitle = normalizeTitle(passed.title);
    if (!passedTitle || !title) return false;
    const sameCategory = passed.category && category && passed.category === category;
    if (sameCategory && (passedTitle.includes(title) || title.includes(passedTitle))) {
      return true;
    }
    return jaccard(title, passedTitle) >= 0.72;
  });
}

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function jaccard(a: string, b: string): number {
  const aSet = new Set(a.split(" ").filter((word) => word.length > 2));
  const bSet = new Set(b.split(" ").filter((word) => word.length > 2));
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  for (const word of aSet) {
    if (bSet.has(word)) intersection++;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * Deterministic article/listicle detector. Removes items that are editorial
 * roundups rather than specific places before the Curator ever sees them.
 */
function isArticleItem(item: IndexedItem): boolean {
  const title = item.title;
  const tags = new Set(item.tags);

  // Explicit tag from normalization: web-result without a lead extraction =
  // the article itself, not a place.
  if (tags.has("web-result") && !tags.has("article-lead")) {
    const looksLikeArticle =
      /^(best|top)\s+[a-z]/i.test(title) ||
      /\byour guide to\b|\bcomplete guide\b/i.test(title) ||
      /\bof\s+(?:chicago'?s?|the\s+city'?s?)\s+best\b/i.test(title) ||
      /\b(style|guide|scene):\s/i.test(title) ||
      /^the best .{5,} in /i.test(title);
    if (looksLikeArticle) return true;
  }

  // Instagram/social posts that aren't events.
  if (tags.has("social_noise") && !tags.has("events") && item.type !== "event") {
    return true;
  }

  return false;
}

/**
 * Batch cross-source confidence pass.
 *
 * Looks up how many distinct sources in place_candidates mentioned each
 * shortlisted item by name. Applies a score modifier:
 *   2 sources  → +0.05
 *   3+ sources → +0.10
 *   Any Circle mention tag → +0.08 additional (on top of source modifier)
 *
 * One batch DB query for all names — never N queries. Because
 * place_candidates stores original casing, we fetch the user's recent
 * candidates and normalize in memory rather than filtering by lowercased
 * names in SQL (which would never match). Fails open: if the query errors,
 * returns items unchanged.
 */
async function applySourceConfidence(
  items: ScoredItem[],
  userId: string,
  supabase: SupabaseClient,
): Promise<ScoredItem[]> {
  if (items.length === 0) return items;

  try {
    // One batch query — recent candidates for this user. Normalize after fetch.
    const { data } = await supabase
      .from("place_candidates")
      .select("name, discovered_via")
      .eq("user_id", userId)
      .order("discovered_at", { ascending: false })
      .limit(1000);

    // normalized_name → set of distinct source domains
    const domainSetsMap = new Map<string, Set<string>>();
    for (const row of (data ?? []) as Array<{
      name: string | null;
      discovered_via: string | null;
    }>) {
      if (!row.name) continue;
      const normalizedName = row.name.toLowerCase().trim();
      const domain = extractDomain(row.discovered_via);
      if (!domain) continue;
      let set = domainSetsMap.get(normalizedName);
      if (!set) {
        set = new Set();
        domainSetsMap.set(normalizedName, set);
      }
      set.add(domain);
    }

    return items.map((s) => {
      const normalizedTitle = s.item.title.toLowerCase().trim();
      const sourceCount = domainSetsMap.get(normalizedTitle)?.size ?? 1;
      const tags = new Set(s.item.tags.map((t) => t.toLowerCase()));

      // Source count modifier
      const sourceModifier =
        sourceCount >= 3 ? 0.1 : sourceCount >= 2 ? 0.05 : 0;

      // Circle mention modifier (independent signal, high trust)
      const circleModifier =
        tags.has("circle") ||
        tags.has("circle-signal") ||
        s.item.source === "contacts"
          ? 0.08
          : 0;

      const totalModifier = sourceModifier + circleModifier;
      if (totalModifier === 0) return s;

      const newScore = Math.min(1, s.score + totalModifier);
      const newReasons = [...s.reasons];
      if (sourceModifier > 0) newReasons.push(`${sourceCount} independent sources`);
      if (circleModifier > 0) newReasons.push("Circle signal");

      return {
        ...s,
        score: Math.round(newScore * 100) / 100,
        reasons: newReasons,
        crossSourceCount: sourceCount,
      };
    });
  } catch (err) {
    // Fail open — return unmodified items rather than crashing curation
    console.warn("[runRadarCuration] source confidence pass failed", err);
    return items;
  }
}

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Not a URL — might be a source key like "lane:xyz"
    return url.split(":")[0] ?? null;
  }
}

function mergeObjectPayload(
  payload: IndexedItem["rawPayload"],
  patch: Record<string, unknown>,
): IndexedItem["rawPayload"] {
  const base = isRecord(payload) ? payload : {};
  return { ...base, ...patch } as IndexedItem["rawPayload"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
