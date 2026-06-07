/**
 * Per-category inventory depth targets — the "warehouse" model.
 *
 * Radar's surface stays calm (the best `surface` per category, default 7), but
 * the backend should keep a deep, balanced inventory behind it. These targets
 * make the four layers explicit per the six canonical Radar categories so
 * discovery/promotion can reason about depth per lane instead of globally
 * (which let dining/finds dominate while culture/moves/events stayed thin).
 *
 * Layers, mapped to where they live:
 *   - raw        → radar_candidate_inbox            (discovered, unresearched)
 *   - researched → places_library / current_events  (has a real verdict)
 *   - ready      → researched ∧ enriched ∧ A/B ∧ above floor (promotable)
 *   - surface    → surfaced_items shown on the board (visible to the owner)
 *
 * Pure module (no IO) so it's tsx-testable and importable anywhere.
 */

import { RADAR_CATEGORIES, type RadarCategory } from "@/lib/radar/category";
import { RADAR_PER_CATEGORY_ACTIVE_TARGET } from "@/lib/brain/constants";

export const INVENTORY_LAYERS = ["raw", "researched", "ready", "surface"] as const;
export type InventoryLayer = (typeof INVENTORY_LAYERS)[number];

export type CategoryInventoryTarget = Record<InventoryLayer, number>;

/** Aggressive default depth: hundreds discovered, dozens ready, best 7 shown. */
const DEFAULT_TARGET: CategoryInventoryTarget = {
  raw: 200,
  researched: 100,
  ready: 50,
  surface: RADAR_PER_CATEGORY_ACTIVE_TARGET,
};

/**
 * Per-category overrides. Events are time-bound and naturally shallower; finds
 * flow through a separate product pipeline (need_scout / finds/scout), so their
 * warehouse depth lives elsewhere and the radar-side target is lighter.
 */
const OVERRIDES: Partial<Record<RadarCategory, Partial<CategoryInventoryTarget>>> = {
  events: { raw: 120, researched: 60, ready: 30 },
  finds: { raw: 150, researched: 80, ready: 40 },
};

export function inventoryTargetFor(category: RadarCategory): CategoryInventoryTarget {
  return { ...DEFAULT_TARGET, ...(OVERRIDES[category] ?? {}) };
}

export const INVENTORY_TARGETS: Record<RadarCategory, CategoryInventoryTarget> =
  Object.fromEntries(
    RADAR_CATEGORIES.map((category) => [category, inventoryTargetFor(category)]),
  ) as Record<RadarCategory, CategoryInventoryTarget>;

/** The visible-board target for a category (the calm surface count). */
export function surfaceTargetFor(category: RadarCategory): number {
  return inventoryTargetFor(category).surface;
}
