/**
 * THE RADAR READINESS CONTRACT.
 *
 * Radar is the finished shelf — the "front room". Nothing reaches it unless it
 * is visually and operationally complete: a full card, a real image, and the
 * correct detail experience for its lane. The warehouse (reserve / discovered /
 * needs_enrichment) can be messy; Radar cannot.
 *
 * This is the SINGLE place that answers "is this item ready to be featured?".
 * It composes three earlier, narrower gates into one final contract:
 *   - card readiness   (title / reason / image / score)
 *   - image readiness  (a real, lane-appropriate hero — never a broken/stock blank)
 *   - detail readiness (per lane: a ready plan, a ready /find dossier, or a brief)
 *
 * It is PURE and dependency-light (lane contract + image guard only) so it can
 * be unit-tested and imported from any gate — engine render, materializer,
 * promote worker, loadSurface, per-lane editors, Finds render. The two facts it
 * cannot compute from the item alone — whether a referenced plan is fully built,
 * and whether a finds dossier passed its own readiness gate — are passed in by
 * the (server-side) caller that already has them.
 *
 * Invariant: `ready === (missing.length === 0)`. Every blocker is a `missing`
 * reason, so a held item can show exactly why ("Building plan", "Finding image").
 */

import type { RadarCategory } from "@/lib/radar/category";
import { detailRouteFor, type LaneDetailRoute } from "@/lib/radar/engine/lanes";
import { assessLaneReadiness } from "@/lib/radar/engine/laneReadiness";
import { isUsableVenueImageUrl } from "@/lib/items/venueImage";

export type RadarReadinessResult = {
  ready: boolean;
  /** Human-readable blockers ("image", "plan", "product_detail", "date_time", …). */
  missing: string[];
  lane: RadarCategory;
  route: LaneDetailRoute;
  imageReady: boolean;
  detailReady: boolean;
  planReady: boolean;
};

export type RadarReadinessInput = {
  lane: RadarCategory;
  // ── card readiness ──────────────────────────────────────────────────────────
  title?: string | null;
  /** The reason/editorial line — why this is worth surfacing. */
  description?: string | null;
  score?: number | null;
  /** The hero image the card will actually render (already resolved by the caller
   *  from item image → brief → curated library → finds dossier). */
  imageUrl?: string | null;
  // ── detail / plan readiness (caller-provided; not derivable from the item) ───
  /** The card advertises an "open plan" action (it carries a stored plan ref). */
  hasPlanRef?: boolean | null;
  /** The referenced plan is fully built: build_status='ready' AND has sections. */
  planReady?: boolean | null;
  /** Finds only: the product dossier passed findIsReady (real image + source +
   *  price + decision). Gates the `/find/[id]` experience. */
  findsReady?: boolean | null;
  // ── lane facts (events need a real date+venue; rest inform diagnostics) ──────
  startsAt?: string | null;
  venue?: string | null;
  location?: string | null;
  neighborhood?: string | null;
};

/**
 * The final gate before an item is allowed onto Radar. Returns the full contract
 * result; callers gate on `.ready` and may surface `.missing` as a "preparing"
 * diagnostic while the item stays in reserve/needs_enrichment.
 */
export function radarItemReadyForFeature(input: RadarReadinessInput): RadarReadinessResult {
  const lane = input.lane;
  const route = detailRouteFor(lane);
  const missing: string[] = [];

  // 1 ── Card readiness ───────────────────────────────────────────────────────
  if (!nonEmpty(input.title)) missing.push("title");
  if (!nonEmpty(input.description)) missing.push("description");
  if (!(typeof input.score === "number" && Number.isFinite(input.score))) missing.push("score");

  // 4 ── Image readiness ──────────────────────────────────────────────────────
  // Every card needs a real image. Reject blanks AND stock/editorial mismatches
  // (a Getty red-carpet photo is worse than holding for a real one).
  const imageReady = isUsableVenueImageUrl(input.imageUrl);
  if (!imageReady) missing.push("image");

  // 2/3 ── Detail + plan readiness, per lane route ────────────────────────────
  let detailReady: boolean;
  let planReady: boolean;

  if (route === "find") {
    // Finds keep their protected buyer UI (/find/[id]) — never a plan template.
    // The dossier's own readiness gate (product image + source + price + verdict)
    // is the detail contract.
    planReady = true;
    detailReady = input.findsReady === true;
    if (!detailReady) missing.push("product_detail");
  } else {
    // plan + brief lanes. A card that opens a plan must open a READY plan — never
    // a building/failed/cancelled one (no blank plan page). A card with no plan
    // ref renders as a brief and only owes its card + image + lane facts.
    const opensPlan = input.hasPlanRef === true;
    planReady = opensPlan ? input.planReady === true : true;
    if (opensPlan && !planReady) missing.push("plan");

    // Events carry a fixed happening: a real date and a venue are non-negotiable.
    if (lane === "events") {
      const facts = assessLaneReadiness({
        lane,
        startsAt: input.startsAt,
        venue: input.venue ?? input.location ?? input.neighborhood,
        location: input.location,
        neighborhood: input.neighborhood,
      });
      for (const fact of facts.missing) {
        if (fact === "date_time" || fact === "venue") missing.push(fact);
      }
    }

    detailReady = !missing.includes("plan") && !missing.includes("date_time") && !missing.includes("venue");
  }

  return {
    ready: missing.length === 0,
    missing: dedupe(missing),
    lane,
    route,
    imageReady,
    detailReady,
    planReady,
  };
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
