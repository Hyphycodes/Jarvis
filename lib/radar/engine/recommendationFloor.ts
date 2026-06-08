/**
 * The recommendation floor (per radar-lane-engine-replication.md). Every lane asks:
 *
 *   "Is this strong enough to deserve space in the user's life?"  — not  "Can we fill a slot?"
 *
 * Suppress: generic / weak-facts / duplicate / wrong-category / stale-dated-event /
 * fantasy-luxury-unless-requested. Pure + unit-tested + conservative: it only blocks
 * CLEAR violations, so it can gate new promotions without gutting a lane.
 */

import { laneConfig } from "@/lib/radar/engine/lanes";

export type FloorInput = {
  lane: string | null | undefined;
  title?: string | null;
  /** The category the classifier assigned (for wrong-category detection). */
  classifiedCategory?: string | null;
  /** Supporting evidence — at least one is needed to clear "generic". */
  reasons?: Array<string | null | undefined> | null;
  tasteFitSummary?: string | null;
  /** 0..1 conviction the curation produced, when available. */
  tasteScore?: number | null;
  /** ISO start (for stale-dated-event detection). */
  startsAt?: string | null;
  /** Explicit duplicate marker (e.g. dedup key collision upstream). */
  isDuplicate?: boolean | null;
  /** Finds: this pick is fantasy luxury (above realistic everyday budgets). */
  isFantasyLuxury?: boolean | null;
  /** Finds: declared aspirational frequency allows fantasy luxury right now. */
  aspirationalAllowed?: boolean | null;
  /** Whether the owner explicitly requested this (overrides several suppressions). */
  userRequested?: boolean | null;
  now?: Date;
};

export type FloorResult = {
  ok: boolean;
  suppressed_because: string[];
};

const GENERIC_TITLE_RE = /^(a |the )?(nice|good|great|cool|fun|local|popular|trendy)\b/i;

export function evaluateRecommendationFloor(input: FloorInput): FloorResult {
  const reasons: string[] = [];
  const now = input.now ?? new Date();

  // Wrong category — the classifier disagrees with the lane it's being shown in.
  if (
    input.classifiedCategory &&
    input.lane &&
    input.classifiedCategory !== input.lane
  ) {
    reasons.push("wrong_category");
  }

  // Stale dated event — a past event must not stay featured.
  const cfg = laneConfig(input.lane);
  if (cfg?.canExpire && input.startsAt) {
    const t = new Date(input.startsAt).getTime();
    if (Number.isFinite(t) && t < now.getTime()) reasons.push("stale_dated");
  }

  // Explicit duplicate.
  if (input.isDuplicate) reasons.push("duplicate");

  // Fantasy luxury in Finds when not allowed and not explicitly requested.
  if (
    input.lane === "finds" &&
    input.isFantasyLuxury &&
    !input.aspirationalAllowed &&
    !input.userRequested
  ) {
    reasons.push("fantasy_luxury");
  }

  // Generic / weak — no supporting evidence AND no taste conviction. User-requested
  // items skip this (he asked for it).
  if (!input.userRequested) {
    const hasReason =
      (input.reasons ?? []).some((r) => typeof r === "string" && r.trim().length > 0) ||
      (typeof input.tasteFitSummary === "string" && input.tasteFitSummary.trim().length > 0);
    const hasConviction = typeof input.tasteScore === "number" && input.tasteScore >= 0.4;
    const genericTitle =
      typeof input.title === "string" && GENERIC_TITLE_RE.test(input.title.trim());
    if ((!hasReason && !hasConviction) || (genericTitle && !hasConviction)) {
      reasons.push("generic_or_weak");
    }
  }

  return { ok: reasons.length === 0, suppressed_because: reasons };
}
