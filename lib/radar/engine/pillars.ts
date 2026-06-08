/**
 * North pillar tagging for any Radar item (per radar-lane-engine-replication.md).
 * Thin wrapper over the pure `attributePillar` kernel + the lane's declared
 * default pillars, so every lane contributes pillar tags North can synthesize.
 */

import { attributePillar, type PillarSlug } from "@/lib/north/attributionMap";
import { laneConfig } from "@/lib/radar/engine/lanes";

export type PillarItem = {
  category?: string | null;
  lane?: string | null;
  occasionType?: string | null;
  tags?: string[] | null;
  title?: string | null;
};

/**
 * Resolve the North pillars an item credits. Uses the content-aware kernel first;
 * falls back to the lane's declared default pillars when the kernel finds nothing,
 * so no featured item is left unattributed.
 */
export function pillarsForItem(item: PillarItem): PillarSlug[] {
  const fromKernel = attributePillar({
    category: item.category ?? item.lane ?? null,
    occasion_type: item.occasionType ?? null,
    tags: item.tags ?? null,
    title: item.title ?? null,
  });
  if (fromKernel.length > 0) return fromKernel;
  const cfg = laneConfig(item.lane ?? item.category);
  return cfg ? cfg.northPillars.slice(0, 2) : [];
}
