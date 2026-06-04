/**
 * North pillar attribution — pure mapping from an item's surface fields to the
 * North pillars it generates a "rep" for.
 *
 * This is the kernel of the North intelligence layer: behavior_signals and
 * surfaced_items are run through `attributePillar` to decide which life pillars
 * a given action credits. It is intentionally pure — no async, no DB calls — so
 * it can be unit-tested and reused anywhere.
 *
 * Most items credit a single pillar. A few credit two: Relationships is
 * additive (a dinner out credits Taste AND Relationships), and an
 * active_social move with physical tags credits Body AND Relationships.
 */

export const PILLAR_SLUGS = [
  "body",
  "skill",
  "creative",
  "ownership",
  "taste",
  "relationships",
  "peace",
] as const;

export type PillarSlug = (typeof PILLAR_SLUGS)[number];

export type AttributionInput = {
  category?: string | null;
  occasion_type?: string | null;
  tags?: string[] | null;
  title?: string | null;
};

// ── Keyword vocabularies ─────────────────────────────────────────────────────
// Grounded in real surfaced_items.category values (dining, culture, places,
// sports, music, style, opportunity, health, creative, outdoors, …) and the
// radar category union. Kept lowercase; matched as substrings so plurals and
// compounds ("real_estate", "sports") are covered.

const BODY_CATEGORY = [
  "fitness",
  "sport",
  "health",
  "golf",
  "basketball",
  "active",
  "outdoor",
  "gym",
  "workout",
  "trail",
  "run",
  "hike",
];

const BODY_PHYSICAL_TAGS = [
  "basketball",
  "golf",
  "gym",
  "workout",
  "sport",
  "outdoor",
  "court",
  "trail",
  "run",
  "hike",
  "bike",
  "swim",
  "lift",
  "horseback",
  "active",
];

const SKILL_CATEGORY = [
  "learning",
  "education",
  "workshop",
  "skill",
  "professional",
  "book",
  "class",
  "course",
  "lecture",
  "seminar",
];

const CREATIVE_CATEGORY = [
  "music",
  "dj",
  "art",
  "creative",
  "studio",
  "craft",
  "film",
  "photography",
  "design",
];

const CREATIVE_TAGS = [
  "velour",
  "dj",
  "creative",
  "studio",
  "vinyl",
  "crate",
  "music",
  "art",
  "scoring",
];

const OWNERSHIP_CATEGORY = [
  "real_estate",
  "land",
  "property",
  "finance",
  "investment",
  "business",
  "opportunity",
  "ownership",
  "deal",
  "wealth",
];

const TASTE_CATEGORY = [
  "dining",
  "food",
  "drink",
  "cigar",
  "watch",
  "shopping",
  "culture",
  "whiskey",
  "coffee",
  "style",
  "restaurant",
  "bar",
  "cocktail",
  "wine",
  "product",
];

const RELATIONSHIPS_CATEGORY = [
  "social",
  "family",
  "friends",
  "gathering",
  "relationship",
  "circle",
  "party",
];

const PEACE_CATEGORY = [
  "rest",
  "faith",
  "church",
  "spiritual",
  "quiet",
  "retreat",
  "recovery",
  "meditation",
  "wellness",
  "sabbath",
];

const PEACE_TAGS = [
  "peace",
  "sunday",
  "faith",
  "prayer",
  "quiet",
  "rest",
  "sabbath",
  "meditation",
  "stillness",
];

// Occasion vocabularies. The codebase carries two: the canonical OccasionType
// enum (refined_dinner, date_night, creative_session, …) and an ad-hoc set
// (active_social, business_room, food_dining, …). We honor both so attribution
// works regardless of which populated the column.
const TASTE_OCCASIONS = [
  "food_dining",
  "refined_dinner",
  "big_night_out",
  "cultural_anchor",
  "date_night",
];

const OWNERSHIP_OCCASIONS = ["business_room"];

const RELATIONSHIP_OCCASIONS = [
  "active_social",
  "family_social",
  "after_work_reset",
  "weekend_move",
  // canonical equivalents
  "casual_hang",
  "date_night",
  "guys_night",
  "weekday_after_work",
  "weekend_day_move",
  "weekend_night_move",
  "family_time",
];

const ACTIVE_SOCIAL_OCCASIONS = ["active_social", "weekend_move", "weekend_day_move"];

const CREATIVE_OCCASIONS = ["creative_session"];

const PEACE_OCCASIONS = ["body_reset", "ritual_maintenance"];

// ── Public entry ─────────────────────────────────────────────────────────────

export function attributePillar(item: AttributionInput): PillarSlug[] {
  const category = (item.category ?? "").toLowerCase();
  const occasion = (item.occasion_type ?? "").toLowerCase();
  const tags = (item.tags ?? []).map((tag) => tag.toLowerCase());

  const catHas = (keywords: string[]) =>
    keywords.some((keyword) => category.includes(keyword));
  const occasionIs = (values: string[]) => values.includes(occasion);
  const tagHas = (keywords: string[]) =>
    tags.some((tag) => keywords.some((keyword) => tag.includes(keyword)));

  const matched = new Set<PillarSlug>();

  // Body: physical category, or an active_social move carrying physical tags.
  const physicalActiveSocial =
    occasionIs(ACTIVE_SOCIAL_OCCASIONS) && tagHas(BODY_PHYSICAL_TAGS);
  if (catHas(BODY_CATEGORY) || physicalActiveSocial) {
    matched.add("body");
  }

  // Skill: learning / workshop / practice surfaces.
  if (catHas(SKILL_CATEGORY)) {
    matched.add("skill");
  }

  // Creative: music / art / craft / studio.
  if (catHas(CREATIVE_CATEGORY) || tagHas(CREATIVE_TAGS) || occasionIs(CREATIVE_OCCASIONS)) {
    matched.add("creative");
  }

  // Ownership: real estate, land, finance, business rooms.
  if (catHas(OWNERSHIP_CATEGORY) || occasionIs(OWNERSHIP_OCCASIONS)) {
    matched.add("ownership");
  }

  // Taste: dining, culture, style, watches, the sensory lanes.
  if (catHas(TASTE_CATEGORY) || occasionIs(TASTE_OCCASIONS)) {
    matched.add("taste");
  }

  // Relationships (additive): social categories or social occasions.
  if (catHas(RELATIONSHIPS_CATEGORY) || occasionIs(RELATIONSHIP_OCCASIONS)) {
    matched.add("relationships");
  }

  // Peace: rest, faith, quiet, recovery.
  if (catHas(PEACE_CATEGORY) || tagHas(PEACE_TAGS) || occasionIs(PEACE_OCCASIONS)) {
    matched.add("peace");
  }

  return capToTwo(matched);
}

/**
 * Items credit at most two pillars. When more than two match, keep one primary
 * pillar plus the additive Relationships credit if present, otherwise the first
 * two primaries in canonical order.
 */
function capToTwo(matched: Set<PillarSlug>): PillarSlug[] {
  const ordered = PILLAR_SLUGS.filter((slug) => matched.has(slug));
  if (ordered.length <= 2) return ordered;

  const primaries = ordered.filter((slug) => slug !== "relationships");
  if (matched.has("relationships")) {
    return [primaries[0], "relationships"];
  }
  return primaries.slice(0, 2);
}
