/**
 * Per-lane readiness gate (per radar-lane-engine-replication.md). "Does this
 * candidate have the facts it needs to be featured?" — distinct from the
 * recommendation FLOOR ("is it strong enough to deserve space?"). Not-ready
 * candidates hold for enrichment rather than surfacing half-built.
 *
 * Pure + unit-tested. Reads required facts from the lane contract (lanes.ts).
 */

import { laneConfig, type RequiredFact } from "@/lib/radar/engine/lanes";

export type LaneItemFacts = {
  lane: string | null | undefined;
  title?: string | null;
  /** ISO start (events/dated culture). */
  startsAt?: string | null;
  venue?: string | null;
  location?: string | null;
  neighborhood?: string | null;
  /** A real source/ticket URL or named source. */
  sourceUrl?: string | null;
  source?: string | null;
  price?: string | number | null;
  imageUrl?: string | null;
  budgetTier?: string | null;
  /** A genuine cultural reason (not "place exists"). */
  culturalReason?: string | null;
  /** An action/sequence/route for moves. */
  actionOrSequence?: string | null;
  /** Culture only: is this a dated happening? If so it must also carry a date. */
  isDated?: boolean | null;
};

export type ReadinessResult = {
  ready: boolean;
  missing: RequiredFact[];
};

export function assessLaneReadiness(item: LaneItemFacts): ReadinessResult {
  const cfg = laneConfig(item.lane);
  // Unknown lane → don't block (the old pipeline owns it).
  if (!cfg) return { ready: true, missing: [] };

  const missing: RequiredFact[] = [];
  for (const fact of cfg.requiredFacts) {
    if (!hasFact(item, fact)) missing.push(fact);
  }
  // Dated culture must also carry a real date/venue (event-style verification).
  if (cfg.lane === "culture" && item.isDated) {
    if (!hasFact(item, "date_time") && !missing.includes("date_time")) missing.push("date_time");
  }
  return { ready: missing.length === 0, missing };
}

function hasFact(item: LaneItemFacts, fact: RequiredFact): boolean {
  switch (fact) {
    case "location":
      return nonEmpty(item.location) || nonEmpty(item.neighborhood) || nonEmpty(item.venue);
    case "date_time":
      return isValidDate(item.startsAt);
    case "venue":
      return nonEmpty(item.venue) || nonEmpty(item.location);
    case "source":
      return nonEmpty(item.sourceUrl) || nonEmpty(item.source);
    case "price":
      return item.price != null && String(item.price).trim().length > 0;
    case "image":
      return nonEmpty(item.imageUrl);
    case "budget_tier":
      return nonEmpty(item.budgetTier);
    case "cultural_reason":
      return nonEmpty(item.culturalReason) || nonEmpty(item.title);
    case "action_or_sequence":
      return nonEmpty(item.actionOrSequence);
  }
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidDate(v: string | null | undefined): boolean {
  if (!v) return false;
  const t = new Date(v).getTime();
  return Number.isFinite(t);
}
