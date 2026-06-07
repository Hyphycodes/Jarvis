/**
 * Per-category inventory health on the surface table.
 *
 * Cheap + accurate: reads the stored `category` column on surfaced_items (every
 * write path normalizes through normalizeRadarCategory, so it's trustworthy) and
 * reports, per category, how many are visible (`shown`) vs waiting in the
 * promotion pool (`pool` = discovered or holding). Drives both observability
 * (the promote worker returns it) and discovery routing (thin lanes first).
 *
 * The summarizer is pure (tsx-testable); only readCategoryInventory touches IO.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RADAR_CATEGORIES,
  normalizeRadarCategory,
  type RadarCategory,
} from "@/lib/radar/category";
import { surfaceTargetFor } from "@/lib/radar/inventoryTargets";

export type SurfaceInventoryRow = {
  category: string | null;
  status: string | null;
  destination: string | null;
};

export type CategoryInventory = {
  category: RadarCategory;
  /** Visible on the board (destination=radar, status shown/opened). */
  shown: number;
  /** Waiting to be promoted (status=discovered or destination=holding). */
  pool: number;
  /** The calm surface target for this lane (default 7). */
  surfaceTarget: number;
  /** How far below the surface target this lane is (0 if met). */
  surfaceGap: number;
};

const SHOWN_STATUSES = new Set(["shown", "opened"]);

export function summarizeCategoryInventory(
  rows: SurfaceInventoryRow[],
): Record<RadarCategory, CategoryInventory> {
  const out = Object.fromEntries(
    RADAR_CATEGORIES.map((category) => [
      category,
      {
        category,
        shown: 0,
        pool: 0,
        surfaceTarget: surfaceTargetFor(category),
        surfaceGap: surfaceTargetFor(category),
      },
    ]),
  ) as Record<RadarCategory, CategoryInventory>;

  for (const row of rows) {
    const category = normalizeRadarCategory(row.category);
    if (!category) continue;
    const entry = out[category];
    const status = row.status ?? "";
    const destination = row.destination ?? "";
    if (destination === "radar" && SHOWN_STATUSES.has(status)) {
      entry.shown += 1;
    } else if (status === "discovered" || destination === "holding") {
      entry.pool += 1;
    }
  }

  for (const category of RADAR_CATEGORIES) {
    out[category].surfaceGap = Math.max(0, out[category].surfaceTarget - out[category].shown);
  }
  return out;
}

export async function readCategoryInventory(
  userId: string,
  supabase: SupabaseClient,
): Promise<Record<RadarCategory, CategoryInventory>> {
  const { data } = await supabase
    .from("surfaced_items")
    .select("category, status, destination")
    .eq("user_id", userId)
    .not("category", "is", null);
  return summarizeCategoryInventory((data ?? []) as SurfaceInventoryRow[]);
}

/** Categories still below their surface target, thinnest (largest gap) first. */
export function thinSurfaceLanes(
  inventory: Record<RadarCategory, CategoryInventory>,
): RadarCategory[] {
  return RADAR_CATEGORIES.filter((category) => inventory[category].surfaceGap > 0).sort(
    (a, b) => inventory[b].surfaceGap - inventory[a].surfaceGap,
  );
}
