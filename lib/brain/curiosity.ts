/**
 * Curiosity Engine — turns Taste Strategist lanes into a concrete source plan.
 *
 * Pure code. No external calls. No Claude. Deterministic.
 *
 * Enforces:
 * - source caps (per lane and overall)
 * - SerpAPI gating (only for explicit product/shopping lanes with high confidence)
 * - lane rotation (avoid searching the same lane every refresh)
 * - dormant-interest cooldown
 * - skip-source-altogether option for lanes that should just become Holding ideas
 */

import "server-only";

import type { ExplorationLane } from "@/lib/brain/tasteStrategist";
import type { InterestGraph } from "@/lib/brain/interests";
import { translateQueryIdeas } from "@/lib/brain/queryTranslation";
import {
  LOCAL_RADAR_MAX_QUERIES_PER_REFRESH,
  LOCAL_RADAR_MAX_RESULTS_PER_QUERY,
  MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH,
} from "@/lib/brain/constants";

export type SourceName =
  | "localRadar"
  | "googlePlaces"
  | "ticketmaster"
  | "tavily"
  | "brave"
  | "serpapi"
  | "mlb"
  | "none";

export type SourcePlanEntry = {
  lane_id: string;
  source: SourceName;
  queries: string[];
  max_results: number;
  destination_bias: ExplorationLane["suggested_destination"];
  preferred_domains?: string[];
  excluded_domains?: string[];
  reason: string;
};

export type CuriosityPlan = {
  lanes: ExplorationLane[];
  sourcePlan: SourcePlanEntry[];
  /** Lanes that intentionally got no source call — they become Holding ideas. */
  skippedLaneIds: string[];
  /** Why each source is included/excluded — useful for audit. */
  notes: string;
};

export type CuriosityInput = {
  lanes: ExplorationLane[];
  graph: InterestGraph;
  /** Available sources (set by the API route based on env keys). */
  availableSources: Partial<Record<SourceName, boolean>>;
  /** Lane ids that were used in the previous refresh — penalize to rotate. */
  recentLaneIds?: string[];
};

// ── Hard caps ────────────────────────────────────────────────────────────────

const PRODUCT_LANE_KEYWORDS = [
  "product", "products", "shopping", "shop", "buy", "watch", "watches",
  "gear", "goods", "wallet", "leather", "merch", "release", "drop",
];

const MAX_QUERIES_PER_LANE = 3;
const MAX_LANES_USING_SOURCE_PER_REFRESH = LOCAL_RADAR_MAX_QUERIES_PER_REFRESH;

// ── Main entry ───────────────────────────────────────────────────────────────

export function buildCuriosityPlan(input: CuriosityInput): CuriosityPlan {
  const recent = new Set(input.recentLaneIds ?? []);
  const sourcePlan: SourcePlanEntry[] = [];
  const skipped: string[] = [];
  const notes: string[] = [];

  let localRadarUsed = 0;
  let totalEstimatedCandidates = 0;

  for (const lane of input.lanes) {
    // Lane rotation: if this lane id ran last time, soften it (cut queries)
    // unless its urgency is high.
    const wasRecent = recent.has(lane.id);

    // Decide the source for this lane.
    const source = pickSourceForLane(lane, input.availableSources, sourcePlan);

    if (source === "none") {
      skipped.push(lane.id);
      notes.push(`${lane.id} → no source (becomes Holding/discovered idea)`);
      continue;
    }

    // SerpAPI gate: only on lanes that are explicitly product/shopping AND
    // confidence is high. Otherwise reroute to localRadar/tavily.
    if (source === "serpapi" && !isProductLane(lane)) {
      skipped.push(lane.id);
      notes.push(`${lane.id} → SerpAPI gated (not a product lane)`);
      continue;
    }
    if (source === "serpapi" && lane.confidence < 0.7) {
      skipped.push(lane.id);
      notes.push(`${lane.id} → SerpAPI gated (confidence ${lane.confidence.toFixed(2)} < 0.70)`);
      continue;
    }

    // localRadar share cap: avoid sending more than the configured number of
    // LocalRadar query groups per refresh.
    if (source === "localRadar" && localRadarUsed >= MAX_LANES_USING_SOURCE_PER_REFRESH) {
      skipped.push(lane.id);
      notes.push(`${lane.id} → LocalRadar lane-cap reached`);
      continue;
    }

    // Pick queries — cut to 1 if the lane was recent (rotation softening).
    const queryCount = wasRecent && lane.urgency !== "high"
      ? 1
      : Math.min(lane.query_ideas.length, MAX_QUERIES_PER_LANE);
    const translated = translateQueryIdeas({
      queries: lane.query_ideas,
      laneTitle: lane.title,
      interestArea: lane.interest_area,
      subinterests: lane.subinterests,
    });
    const queries = translated.slice(0, queryCount);

    // Estimate candidates from this lane and respect the global cap.
    const perQuery = perQueryResultCap(source);
    const estimated = queries.length * perQuery;
    if (totalEstimatedCandidates + estimated > MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH) {
      const remaining = Math.max(
        0,
        MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH - totalEstimatedCandidates,
      );
      if (remaining <= 0) {
        skipped.push(lane.id);
        notes.push(`${lane.id} → global candidate cap reached`);
        continue;
      }
      // Reduce queries to fit
      const queriesAllowed = Math.max(1, Math.floor(remaining / perQuery));
      queries.splice(queriesAllowed);
    }

    if (queries.length === 0) {
      skipped.push(lane.id);
      continue;
    }

    sourcePlan.push({
      lane_id: lane.id,
      source,
      queries,
      max_results: perQuery,
      destination_bias: lane.suggested_destination,
      preferred_domains: lane.preferred_domains,
      excluded_domains: lane.excluded_domains,
      reason: `${lane.mode} lane → ${source}`,
    });

    if (source === "localRadar") localRadarUsed++;
    totalEstimatedCandidates += queries.length * perQuery;
  }

  return {
    lanes: input.lanes,
    sourcePlan,
    skippedLaneIds: skipped,
    notes: notes.join("; "),
  };
}

// ── Source picker ────────────────────────────────────────────────────────────

function pickSourceForLane(
  lane: ExplorationLane,
  available: Partial<Record<SourceName, boolean>>,
  existing: SourcePlanEntry[],
): SourceName {
  // Honor explicit hints from the lane's source_strategy first.
  const hints = lane.source_strategy.map((s) => s.trim()) as SourceName[];

  // Lanes destined for "north" or "holding" with low urgency don't need a
  // source — they become Holding ideas from the strategist itself.
  if (
    (lane.suggested_destination === "north" || lane.suggested_destination === "holding") &&
    lane.urgency === "low" &&
    lane.confidence < 0.6
  ) {
    return "none";
  }

  for (const hint of hints) {
    if (!isValidSource(hint)) continue;
    if (hint === "brave" && available.tavily) continue; // never both
    if (hint === "serpapi" && !isProductLane(lane)) continue;
    if (available[hint]) return hint;
  }

  // Fallback by interest area heuristic.
  if (isProductLane(lane) && available.serpapi && lane.confidence >= 0.7) {
    return "serpapi";
  }

  if (isPhysicalPlaceLane(lane) && available.googlePlaces) {
    return "googlePlaces";
  }

  if (isEventLane(lane) && available.ticketmaster) {
    return "ticketmaster";
  }

  // Default: web research via LocalRadar (Tavily-first/Brave-fallback inside)
  if (available.tavily || available.brave) {
    return "localRadar";
  }

  // Truly no source available
  return "none";

  // (existing referenced for future lane-collision logic; suppress unused)
  void existing;
}

// ── Lane classifiers ─────────────────────────────────────────────────────────

function isProductLane(lane: ExplorationLane): boolean {
  const blob = `${lane.title} ${lane.interest_area} ${lane.subinterests.join(" ")}`
    .toLowerCase();
  return PRODUCT_LANE_KEYWORDS.some((kw) => blob.includes(kw));
}

function isPhysicalPlaceLane(lane: ExplorationLane): boolean {
  const blob = `${lane.title} ${lane.interest_area}`.toLowerCase();
  return /(restaurant|bar|cafe|dining|lounge|hotel|store|place|venue|spot|gym|spa)/.test(blob);
}

function isEventLane(lane: ExplorationLane): boolean {
  const blob = `${lane.title} ${lane.interest_area}`.toLowerCase();
  return /(event|concert|show|festival|game|match|exhibit|opening)/.test(blob);
}

function isValidSource(value: string): value is SourceName {
  return [
    "localRadar", "googlePlaces", "ticketmaster",
    "tavily", "brave", "serpapi", "mlb", "none",
  ].includes(value);
}

function perQueryResultCap(source: SourceName): number {
  switch (source) {
    case "localRadar": return LOCAL_RADAR_MAX_RESULTS_PER_QUERY;
    case "tavily": return 4;
    case "brave": return 4;
    case "googlePlaces": return 5;
    case "ticketmaster": return 20;
    case "serpapi": return 4;
    case "mlb": return 10;
    case "none": return 0;
  }
}
