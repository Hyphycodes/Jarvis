import type { IndexedItem } from "@/lib/index/types";
import type { ScoredItem } from "@/lib/brain/types";
import { scoreIndexedItem } from "@/lib/scoring/scoreIndexedItem";

/**
 * Selects the top-N candidates from a pool. Deterministic.
 */
export function shortlistByScore(
  items: IndexedItem[],
  context: {
    homeLat?: number;
    homeLng?: number;
    currentWeather?: {
      temperatureF?: number;
      precipitationProbability?: number;
    };
    northTags?: string[];
    recentPassCategories?: string[];
    maxItems?: number;
  } = {},
): ScoredItem[] {
  const max = context.maxItems ?? 20;
  return items
    .map((item) => {
      const s = scoreIndexedItem(item, {
        homeLat: context.homeLat,
        homeLng: context.homeLng,
        currentWeather: context.currentWeather,
        northTags: context.northTags,
        recentPassCategories: context.recentPassCategories,
      });
      return { item, score: s.total, reasons: s.reasons, northAlignment: s.northAlignment };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
