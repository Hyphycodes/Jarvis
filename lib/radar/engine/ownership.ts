import { normalizeRadarCategory } from "@/lib/radar/category";

/**
 * Lanes the curation engine owns end-to-end. The old promote/materialize
 * pipeline MUST NOT manage these — its living-7 displacement would evict and
 * churn engine cards (and revert scheduled ones). Grows as lanes cut over.
 */
export const ENGINE_OWNED_LANES = new Set<string>(["dining", "events"]);
export const ENGINE_SOURCE = "radar_engine";

export function isEngineOwnedCategory(category: string | null | undefined): boolean {
  const c = normalizeRadarCategory(category);
  return c ? ENGINE_OWNED_LANES.has(c) : false;
}

/**
 * A surfaced_items row the old pipeline must leave alone: either produced by the
 * engine, or sitting in an engine-owned lane (so a stray old-pipeline row in
 * that lane is ignored too, not promoted alongside the engine's shelf).
 */
export function isEngineOwnedRow(row: {
  source?: string | null;
  category?: string | null;
}): boolean {
  if (row.source === ENGINE_SOURCE) return true;
  return isEngineOwnedCategory(row.category ?? null);
}
