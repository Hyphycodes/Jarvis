import type { IndexedItem } from "@/lib/index/types";
import type { ScoredItem } from "@/lib/brain/types";
import type { LaneVelocityProfile } from "@/lib/north/laneVelocity";
import { scoreIndexedItem } from "@/lib/scoring/scoreIndexedItem";

// ── Lane → item-field matching ───────────────────────────────────────────────
// Maps velocity lane names to IndexedItem fields (category, type, tags).
// IndexedItem has no occasion_type, so we use category + type + tags.

type LaneMatcher = (item: IndexedItem) => boolean;

const LANE_MATCHERS: Record<string, LaneMatcher> = {
  food_dining: (item) => {
    const cat = (item.category ?? "").toLowerCase();
    return (
      cat.includes("dining") ||
      cat.includes("food") ||
      cat.includes("restaurant") ||
      item.type === "restaurant" ||
      item.tags.some((t) =>
        ["dining", "food", "restaurant", "cigar", "coffee", "drinks", "cocktail"].includes(
          t.toLowerCase(),
        ),
      )
    );
  },
  active_social: (item) => {
    const cat = (item.category ?? "").toLowerCase();
    return (
      cat.includes("social") ||
      cat.includes("sports") ||
      cat.includes("active") ||
      item.type === "event" ||
      item.tags.some((t) =>
        ["social", "active", "sports", "basketball", "golf", "outdoor"].includes(
          t.toLowerCase(),
        ),
      )
    );
  },
  weekend_move: (item) => {
    const cat = (item.category ?? "").toLowerCase();
    return (
      cat.includes("outdoors") ||
      cat.includes("activity") ||
      cat.includes("places") ||
      item.type === "place" ||
      item.tags.some((t) =>
        ["outdoor", "nature", "weekend", "active", "park", "trail"].includes(
          t.toLowerCase(),
        ),
      )
    );
  },
  culture_creative: (item) => {
    const cat = (item.category ?? "").toLowerCase();
    return (
      cat.includes("culture") ||
      cat.includes("music") ||
      cat.includes("creative") ||
      cat.includes("art") ||
      cat.includes("events") ||
      item.type === "culture" ||
      item.type === "creative" ||
      item.type === "event" ||
      item.tags.some((t) =>
        ["cultural", "music", "art", "jazz", "gallery", "creative", "film"].includes(
          t.toLowerCase(),
        ),
      )
    );
  },
  after_work_reset: (item) => {
    const cat = (item.category ?? "").toLowerCase();
    return (
      cat.includes("health") ||
      cat.includes("outdoor") ||
      cat.includes("places") ||
      item.type === "health" ||
      item.tags.some((t) =>
        ["outdoor", "reset", "walk", "trail", "gym", "recovery", "casual"].includes(
          t.toLowerCase(),
        ),
      )
    );
  },
  business_room: (item) => {
    const cat = (item.category ?? "").toLowerCase();
    return (
      cat.includes("opportunity") ||
      cat.includes("real_estate") ||
      cat.includes("business") ||
      item.type === "real_estate" ||
      item.type === "recommendation" ||
      item.tags.some((t) =>
        ["business", "opportunity", "real-estate", "land", "investment"].includes(
          t.toLowerCase(),
        ),
      )
    );
  },
  skill_learning: (item) => {
    const cat = (item.category ?? "").toLowerCase();
    return (
      cat.includes("skill") ||
      cat.includes("education") ||
      cat.includes("workshop") ||
      item.tags.some((t) =>
        ["learning", "skill", "workshop", "practice", "craft", "course"].includes(
          t.toLowerCase(),
        ),
      )
    );
  },
};

function matchesLane(item: IndexedItem, lane: string): boolean {
  const matcher = LANE_MATCHERS[lane];
  if (matcher) return matcher(item);
  // Fallback: substring match on category or tags for custom/future lane names
  const lower = lane.toLowerCase();
  return (
    (item.category ?? "").toLowerCase().includes(lower) ||
    item.tags.some((t) => t.toLowerCase().includes(lower))
  );
}

// ── Score deltas ─────────────────────────────────────────────────────────────

const PRIORITY_BOOST = 0.08;
const SUPPRESSED_PENALTY = 0.06;

// ── Main export ──────────────────────────────────────────────────────────────

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
    avoidKeywords?: string[];
    dealbreakers?: string[];
    maxItems?: number;
    /**
     * When provided, items whose category/type/tags map to a priority lane
     * receive a +0.08 score boost, and suppressed-lane items receive -0.06.
     * Scores are clamped to [0, 1]. Computed once per curation run by the
     * caller; not async.
     */
    velocityProfile?: LaneVelocityProfile;
  } = {},
): ScoredItem[] {
  const max = context.maxItems ?? 20;
  const velocity = context.velocityProfile;

  return items
    .map((item) => {
      const s = scoreIndexedItem(item, {
        homeLat: context.homeLat,
        homeLng: context.homeLng,
        currentWeather: context.currentWeather,
        northTags: context.northTags,
        recentPassCategories: context.recentPassCategories,
        avoidKeywords: context.avoidKeywords,
        dealbreakers: context.dealbreakers,
      });

      let score = s.total;

      if (velocity) {
        const inPriority = velocity.priorityLanes.some((lane) => matchesLane(item, lane));
        const inSuppressed = velocity.suppressedLanes.some((lane) => matchesLane(item, lane));
        if (inPriority) score = Math.min(1, score + PRIORITY_BOOST);
        if (inSuppressed) score = Math.max(0, score - SUPPRESSED_PENALTY);
      }

      return { item, score, reasons: s.reasons, northAlignment: s.northAlignment };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
