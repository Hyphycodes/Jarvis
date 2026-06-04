/**
 * Founder Interest Seed — the initial Interest Graph.
 *
 * This is a starting point, not a prison. Status, weights, and confidence
 * shift based on behavior, memory proposals, and explicit overrides.
 * The graph builder layers memory + behavior on top of this seed at runtime.
 */

import type { Interest } from "@/lib/brain/interests";

type SeedInterest = Omit<
  Interest,
  "lastExploredAt" | "explorationCount" | "belief"
> & {
  /** Belief defaults to "seed_profile" unless overridden. */
  belief?: Interest["belief"];
};

// ── Top-level area helper ────────────────────────────────────────────────────

function area(
  id: string,
  label: string,
  weight: number,
  fields: Partial<Omit<SeedInterest, "id" | "label" | "weight">> = {},
): SeedInterest {
  return {
    id,
    label,
    weight,
    parentId: undefined,
    status: "active",
    confidence: 0.85,
    subinterests: [],
    adjacent: [],
    relatedSources: [],
    preferredDestinations: ["radar", "holding"],
    spendingPosture: "low",
    effortLevel: "medium",
    seasonality: "year_round",
    examples: [],
    avoidNotes: [],
    ...fields,
  };
}

function sub(
  id: string,
  label: string,
  parentId: string,
  weight: number,
  fields: Partial<Omit<SeedInterest, "id" | "label" | "parentId" | "weight">> = {},
): SeedInterest {
  return {
    id,
    label,
    parentId,
    weight,
    status: "active",
    confidence: 0.8,
    subinterests: [],
    adjacent: [],
    relatedSources: [],
    preferredDestinations: ["radar", "holding"],
    spendingPosture: "low",
    effortLevel: "medium",
    seasonality: "year_round",
    examples: [],
    avoidNotes: [],
    ...fields,
  };
}

// ── Top-level areas ──────────────────────────────────────────────────────────

const TOP_LEVEL: SeedInterest[] = [
  area("dining", "Dining & food", 0.95, {
    relatedSources: ["googlePlaces", "localRadar", "tavily"],
    spendingPosture: "paid",
    effortLevel: "medium",
    avoidNotes: [
      "No tourist traps, chains, hotel restaurants, or 'best of' clickbait.",
      "No try-hard plating, no overly precious tasting menus on weeknights.",
    ],
    examples: ["steak houses", "low-lit dining rooms", "West Loop dinners"],
  }),
  area("culture_nightlife", "Culture & nightlife (with restraint)", 0.85, {
    relatedSources: ["ticketmaster", "localRadar", "tavily"],
    spendingPosture: "paid",
    effortLevel: "medium",
    avoidNotes: [
      "No loud club energy. No corny social settings. No mass-market venues.",
    ],
  }),
  area("style_menswear", "Style & menswear", 0.85, {
    relatedSources: ["localRadar", "tavily", "googlePlaces"],
    spendingPosture: "high",
    effortLevel: "low",
    avoidNotes: ["No fast fashion. No hype-driven trends. No try-hard styling."],
  }),
  area("watches", "Watches", 0.7, {
    relatedSources: ["localRadar", "tavily", "brave"],
    spendingPosture: "low",
    effortLevel: "low",
    avoidNotes: ["No hype, no flex, no Rolex chase."],
  }),
  area("real_estate_wealth", "Real estate & wealth systems", 0.85, {
    relatedSources: ["tavily", "brave"],
    spendingPosture: "high",
    effortLevel: "high",
    preferredDestinations: ["north", "holding"],
    avoidNotes: ["No get-rich-quick. No retail crypto. No high-friction schemes."],
  }),
  area("land_homestead", "Land, homestead & building", 0.8, {
    relatedSources: ["tavily", "brave", "localRadar"],
    spendingPosture: "high",
    effortLevel: "high",
    preferredDestinations: ["north", "holding"],
    avoidNotes: ["No suburban-tract energy. No HOA territory."],
  }),
  area("creative_craft", "Creative craft", 0.85, {
    relatedSources: ["tavily", "brave", "localRadar"],
    spendingPosture: "low",
    effortLevel: "medium",
    avoidNotes: ["No content-farm aesthetics, no engagement-bait creative."],
  }),
  area("travel", "Travel & global living", 0.75, {
    relatedSources: ["tavily", "brave"],
    spendingPosture: "high",
    effortLevel: "high",
    preferredDestinations: ["holding", "north"],
    avoidNotes: ["No mass-tourism itineraries. No cruise-ship culture. No packaged tours."],
  }),
  area("health_discipline", "Health & discipline", 0.75, {
    relatedSources: ["tavily", "brave", "localRadar"],
    spendingPosture: "low",
    effortLevel: "medium",
    avoidNotes: ["No biohacker hype. No fad supplements. No gym-bro aesthetic."],
  }),
  area("faith_meaning", "Faith, meaning & community", 0.75, {
    relatedSources: ["tavily", "localRadar"],
    spendingPosture: "free",
    effortLevel: "low",
    preferredDestinations: ["north", "holding"],
    avoidNotes: ["No performance religion. No prosperity gospel."],
  }),
  area("tech_ai_tools", "Technology, AI & tools", 0.7, {
    relatedSources: ["tavily", "brave"],
    spendingPosture: "low",
    effortLevel: "medium",
    avoidNotes: ["No SaaS noise. No AI hype-cycle clickbait."],
  }),
  area("outdoors_nature", "Outdoors & nature", 0.75, {
    relatedSources: ["googlePlaces", "tavily", "localRadar"],
    spendingPosture: "low",
    effortLevel: "medium",
    seasonality: "year_round",
    avoidNotes: ["No theme parks. No crowded festivals."],
  }),
];

// ── Subinterests (grouped by parent) ─────────────────────────────────────────

const SUBS: SeedInterest[] = [
  // dining
  sub("steak", "Steak & red meat", "dining", 0.95, { spendingPosture: "paid" }),
  sub("low_lit_dining", "Low-lit, atmospheric rooms", "dining", 0.92),
  sub("real_food", "Real food, animal-based friendly", "dining", 0.85),
  sub("local_dining", "Local dining with city energy", "dining", 0.9),
  sub("refined_not_tryhard", "Refined but not try-hard", "dining", 0.88),
  sub("cocktail_lounges", "Cocktail lounges & bar dining", "dining", 0.75),

  // culture_nightlife
  sub("jazz", "Jazz & listening rooms", "culture_nightlife", 0.9),
  sub("intimate_live_music", "Intimate live music", "culture_nightlife", 0.85),
  sub("cultural_events", "Cultural events (architecture, design)", "culture_nightlife", 0.7),
  sub("tasteful_lounge_dj", "Tasteful DJ / lounge energy", "culture_nightlife", 0.6),

  // style_menswear
  sub("quiet_luxury", "Quiet luxury", "style_menswear", 0.9),
  sub("rugged_masculine", "Rugged masculine", "style_menswear", 0.85),
  sub("sherpa_western", "Sherpa / western texture", "style_menswear", 0.8),
  sub("craftsmanship_materials", "Craftsmanship materials & texture", "style_menswear", 0.8),
  sub("vintage_texture", "Vintage texture", "style_menswear", 0.75),
  sub("boutique_releases", "Boutique releases", "style_menswear", 0.7),

  // watches
  sub("vintage_seiko", "Vintage Seiko", "watches", 0.85),
  sub("affordable_collecting", "Affordable collecting", "watches", 0.8),
  sub("watch_meetups", "Watch meetups & events", "watches", 0.65),
  sub("soulful_objects", "Soulful objects with legacy", "watches", 0.8),

  // real_estate_wealth
  sub("investor_relationships", "Investor relationships", "real_estate_wealth", 0.85),
  sub("distressed_properties", "Distressed properties", "real_estate_wealth", 0.8),
  sub("small_team_systems", "Small-team systems", "real_estate_wealth", 0.85),
  sub("deal_flow", "Deal flow", "real_estate_wealth", 0.8),
  sub("low_friction_income", "Low-friction scalable income", "real_estate_wealth", 0.8),

  // land_homestead
  sub("michigan_wisconsin_land", "Michigan / Wisconsin land", "land_homestead", 0.85),
  sub("rural_property_abroad", "Rural property abroad", "land_homestead", 0.75),
  sub("cabins_timber", "Cabins, timber, woodworking", "land_homestead", 0.8),
  sub("homestead_infra", "Wells, septic, water, privacy", "land_homestead", 0.7),
  sub("outdoor_kitchens", "Outdoor kitchens & fires", "land_homestead", 0.7),

  // creative_craft
  sub("music_craft", "Music & scoring", "creative_craft", 0.85),
  sub("cinematic_visuals", "Cinematic visuals & short films", "creative_craft", 0.85),
  sub("dj_crates", "DJ crates & analog texture", "creative_craft", 0.75),
  sub("narrative_creative", "Narrative-driven creative production", "creative_craft", 0.8),

  // travel
  sub("slow_travel", "Slow travel destinations", "travel", 0.85),
  sub("craftsmanship_destinations", "Craftsmanship & artisan destinations", "travel", 0.85),
  sub("culinary_travel", "Culinary travel destinations", "travel", 0.8),
  sub("long_term_living", "Long-term living abroad", "travel", 0.75),
  sub("international_neighborhoods", "World-class urban neighborhoods", "travel", 0.7),

  // health_discipline
  sub("animal_based_diet", "Animal-based diet", "health_discipline", 0.85),
  sub("strength_training", "Strength training", "health_discipline", 0.8),
  sub("sunlight_routine", "Sunlight & recovery", "health_discipline", 0.75),
  sub("clean_masculine", "Clean masculine lifestyle", "health_discipline", 0.8),

  // faith_meaning
  sub("authenticity", "Authenticity & truth", "faith_meaning", 0.85),
  sub("christian_grounding", "Christian grounding", "faith_meaning", 0.75),
  sub("service_community", "Service & community", "faith_meaning", 0.7),

  // tech_ai_tools
  sub("automation", "Automation", "tech_ai_tools", 0.8),
  sub("personal_os", "Personal operating systems", "tech_ai_tools", 0.85),
  sub("real_estate_tools", "Real estate tools", "tech_ai_tools", 0.75),
  sub("creative_workflow_tools", "Creative workflow tools", "tech_ai_tools", 0.7),
  sub("ai_assisted_systems", "AI-assisted systems", "tech_ai_tools", 0.85),

  // outdoors_nature
  sub("horses", "Horses", "outdoors_nature", 0.7),
  sub("golf", "Golf", "outdoors_nature", 0.7),
  sub("trails_water", "Trails & water", "outdoors_nature", 0.75),
  sub("bonfires", "Bonfires & long evenings", "outdoors_nature", 0.7),
];

// ── Adjacency edges (taste expansion routes) ─────────────────────────────────

const ADJACENCY: Array<[string, string]> = [
  // Dining ↔ Style: refined-vs-loud taste transfers
  ["dining", "style_menswear"],
  ["dining", "culture_nightlife"],
  // Watches ↔ Style: same collector mindset
  ["watches", "style_menswear"],
  // Real estate ↔ Land: same wealth/ownership posture
  ["real_estate_wealth", "land_homestead"],
  // Land ↔ Travel: rural property and long-term living
  ["land_homestead", "travel"],
  // Creative ↔ Tech: workflow tooling for craft
  ["creative_craft", "tech_ai_tools"],
  // Creative ↔ Culture: input feeds output
  ["creative_craft", "culture_nightlife"],
  // Health ↔ Outdoors: physical environment
  ["health_discipline", "outdoors_nature"],
  // Faith ↔ Health: discipline lineage
  ["faith_meaning", "health_discipline"],
  // Travel ↔ Dining: culinary destinations
  ["travel", "dining"],
  // Travel ↔ Land: long-term living abroad
  ["travel", "land_homestead"],
];

// ── Build & export the seed ──────────────────────────────────────────────────

export function buildSeedInterests(): Interest[] {
  // Wire up subinterests onto their parents.
  const byId = new Map<string, SeedInterest>();
  for (const node of [...TOP_LEVEL, ...SUBS]) {
    byId.set(node.id, { ...node });
  }
  for (const sub of SUBS) {
    if (!sub.parentId) continue;
    const parent = byId.get(sub.parentId);
    if (!parent) continue;
    if (!parent.subinterests.includes(sub.id)) {
      parent.subinterests.push(sub.id);
    }
  }
  // Wire up adjacency edges (bidirectional) on top-level areas.
  for (const [a, b] of ADJACENCY) {
    const A = byId.get(a);
    const B = byId.get(b);
    if (A && !A.adjacent.includes(b)) A.adjacent.push(b);
    if (B && !B.adjacent.includes(a)) B.adjacent.push(a);
  }

  return Array.from(byId.values()).map((seed) => ({
    ...seed,
    explorationCount: 0,
    belief: seed.belief ?? "seed_profile",
  }));
}

export function getSeedTopLevelIds(): string[] {
  return TOP_LEVEL.map((t) => t.id);
}
