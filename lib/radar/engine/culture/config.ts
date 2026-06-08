/**
 * Culture engine — sub-library config + classification + shared brain-tree types
 * (per jarvis-culture-engine-brain-tree.md). Culture is mostly TIMELESS (dated
 * single happenings belong in Events); it deepens taste, creativity, and
 * conversation. One warehouse (culture_items.sub_library).
 *
 * Pure + dependency-light so it's unit-testable.
 */

export type CultureSubLibrary =
  | "culture_exhibits"
  | "culture_performances"
  | "culture_screenings"
  | "culture_architecture_design"
  | "culture_craftsmanship"
  | "culture_history";

/** Sub-libraries the scout actively fishes (the rest still classify + render). */
export const CULTURE_SCOUT_SUBLIBRARIES: CultureSubLibrary[] = [
  "culture_exhibits",
  "culture_performances",
  "culture_screenings",
  "culture_architecture_design",
];

export const CULTURE_SUBLIBRARIES_ALL: CultureSubLibrary[] = [
  "culture_exhibits",
  "culture_performances",
  "culture_screenings",
  "culture_architecture_design",
  "culture_craftsmanship",
  "culture_history",
];

export type CultureSubLibraryConfig = {
  subLibrary: CultureSubLibrary;
  label: string;
  subTypes: string[];
  specialistSources: string[];
  /** SerpAPI/Tavily query templates ({city} substituted). */
  queries: string[];
  brief: string;
};

export const CULTURE_SUBLIBRARIES: Record<CultureSubLibrary, CultureSubLibraryConfig> = {
  culture_exhibits: {
    subLibrary: "culture_exhibits",
    label: "Exhibits",
    subTypes: ["museum_exhibit", "gallery_show", "photography", "design_exhibit", "historical_exhibit"],
    specialistSources: [
      "Art Institute of Chicago", "MCA Chicago", "Chicago History Museum", "Chicago Gallery News",
      "Museum of Contemporary Photography", "Design Museum of Chicago", "Hyde Park Art Center",
    ],
    queries: ["museum exhibit {city}", "gallery show {city}"],
    brief:
      "You judge real curatorial depth over shallow spectacle: institution credibility, artist/material/" +
      "historical significance, whether it's worth seeing in person, and taste-stretch without feeling random. " +
      "Kill tourist-bait art rooms, shallow immersive exhibits, and venue-only cards. Axes: curatorial depth, " +
      "institution quality, originality, cultural value, taste stretch, conversation value, not-touristy.",
  },
  culture_performances: {
    subLibrary: "culture_performances",
    label: "Performances",
    subTypes: ["theater", "opera", "ballet", "symphony", "chamber", "jazz", "literary", "performance_art"],
    specialistSources: [
      "Chicago Reader theater", "CSO / Symphony Center", "Lyric Opera", "Joffrey Ballet",
      "Goodman Theatre", "Steppenwolf", "Constellation", "Green Mill", "Jazz Showcase",
    ],
    queries: ["symphony season {city}", "theater performance {city}"],
    brief:
      "You judge artistic ambition over commercially-safe nights out: institution/venue seriousness, real " +
      "cultural value, and whether it feeds Taste/Creative/Skill. A FIXED dated single show may belong in " +
      "Events; a series/institution/program is Culture. Kill clubby nights disguised as culture and generic " +
      "promoted shows. Axes: artistic ambition, institution credibility, taste stretch, creative payoff, conversation.",
  },
  culture_screenings: {
    subLibrary: "culture_screenings",
    label: "Screenings",
    subTypes: ["repertory", "classic", "foreign", "retrospective", "art_house", "documentary", "film_series"],
    specialistSources: [
      "Music Box Theatre", "Gene Siskel Film Center", "Facets", "Doc Films",
      "Chicago International Film Festival", "museum film programs",
    ],
    queries: ["repertory film {city}", "art house screening {city}"],
    brief:
      "You judge theater-worthy over streaming-level: repertory value, director/cultural significance, and " +
      "cinematic input. Kill generic blockbuster listings and streaming-level picks with no theater value. " +
      "Axes: cinema significance, theater-worthiness, cultural value, creative input, rarity, conversation, not-generic.",
  },
  culture_architecture_design: {
    subLibrary: "culture_architecture_design",
    label: "Architecture & Design",
    subTypes: ["architecture_tour", "design_talk", "interior_exhibit", "historic_building", "modernist", "showroom"],
    specialistSources: [
      "Chicago Architecture Center", "Open House Chicago", "design institutions", "preservation orgs",
    ],
    queries: ["architecture exhibit {city}", "design exhibit {city}"],
    brief:
      "You judge real design value over decor bait: materiality, craft, spatial atmosphere, and old-money/" +
      "timeless/modern alignment. Decide Culture vs Places vs Moves by whether cultural substance, location, or " +
      "action dominates. Axes: architectural/design significance, craft/material, atmosphere, visual input, originality.",
  },
  culture_craftsmanship: {
    subLibrary: "culture_craftsmanship",
    label: "Craftsmanship",
    subTypes: ["craft_workshop", "maker_studio", "furniture", "textiles", "leather", "wood", "artisan_market"],
    specialistSources: ["local maker/craft calendars", "design/craft institutions", "heritage brands"],
    queries: ["craft workshop {city}", "maker studio {city}"],
    brief:
      "You judge real craft over marketing: materials that age well, learning value, and relevance to the owner's " +
      "interest in design, tools, watches, cigars, old-world craft, and interiors. Kill Etsy-fair generic. " +
      "Axes: authenticity, material quality, learning value, taste/skill/ownership relevance, originality.",
  },
  culture_history: {
    subLibrary: "culture_history",
    label: "History",
    subTypes: ["historical_exhibit", "neighborhood_history", "architectural_history", "heritage_site", "archive_program"],
    specialistSources: ["Chicago History Museum", "neighborhood history orgs", "libraries/archives", "heritage groups"],
    queries: ["Chicago history exhibit {city}", "heritage program {city}"],
    brief:
      "You judge story depth + cultural grounding over tourist trivia: whether it gives better context for " +
      "Chicago/life/taste and feeds conversation + identity. Kill academic-dry and tourist-bait alike. " +
      "Axes: story depth, cultural grounding, identity relevance, conversation value, context value, not-trivia.",
  },
};

// ── Classification ─────────────────────────────────────────────────────────────
const SCREEN_RE = /\b(film|cinema|screening|repertory|documentary|director|retrospective|movie|cinematheque)\b/i;
const PERF_RE = /\b(theater|theatre|opera|ballet|symphony|orchestra|chamber|philharmonic|jazz|recital|performance|spoken word|literary reading|concert hall)\b/i;
const ARCH_RE = /\b(architecture|architectural|design|modernist|interior|showroom|building|preservation|open house)\b/i;
const CRAFT_RE = /\b(craft|maker|artisan|workshop|textile|furniture|woodwork|leather|ceramics|materials|demonstration)\b/i;
const HISTORY_RE = /\b(history|historical|heritage|archive|landmark|preservation society)\b/i;
const EXHIBIT_RE = /\b(museum|gallery|exhibit|exhibition|photography|collection|installation|biennial|retrospective)\b/i;

export function classifyCultureSubLibrary(input: {
  title?: string | null;
  description?: string | null;
  venue_name?: string | null;
  institution_name?: string | null;
  vibe_keywords?: string[] | null;
}): CultureSubLibrary {
  const blob = [
    input.title,
    input.description,
    input.venue_name,
    input.institution_name,
    ...(input.vibe_keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (SCREEN_RE.test(blob)) return "culture_screenings";
  if (PERF_RE.test(blob)) return "culture_performances";
  if (ARCH_RE.test(blob)) return "culture_architecture_design";
  if (CRAFT_RE.test(blob)) return "culture_craftsmanship";
  if (HISTORY_RE.test(blob)) return "culture_history";
  if (EXHIBIT_RE.test(blob)) return "culture_exhibits";
  return "culture_exhibits"; // visual-art default
}

export function isCultureSubLibrary(value: unknown): value is CultureSubLibrary {
  return typeof value === "string" && (CULTURE_SUBLIBRARIES_ALL as string[]).includes(value);
}

// ── Shared brain-tree decision types ────────────────────────────────────────────

export type CultureSourceQuality = "official" | "trusted" | "partial" | "weak" | "unknown";

export type CultureTruthAssessment = {
  exists_confidence: number;
  source_quality: CultureSourceQuality;
  institution_confidence: number;
  date_confidence?: number;
  verified_facts: string[];
  unsupported_claims: string[];
  needs_enrichment: boolean;
  is_dated: boolean;
};

export type CultureSurface = "today" | "radar" | "reserve" | "suppress";

export type CultureFitAssessment = {
  fit_score: number;
  timing_fit: "today" | "this_week" | "later" | "bad_timing";
  friction_level: "low" | "medium" | "high" | "unknown";
  social_fit: "solo" | "friend" | "date" | "family" | "group" | "unknown";
  recommended_surface: CultureSurface;
  reasons: string[];
  vetoes: string[];
};

export type CultureSubstance = "deep" | "solid" | "light" | "shallow";
export type CultureDepthAssessment = {
  depth_score: number;
  substance: CultureSubstance;
  reasons: string[];
  shallow_flags: string[];
};

export type CulturePlanabilityAssessment = {
  plan_ready: boolean;
  best_time?: string | null;
  suggested_duration?: string | null;
  pairings: string[];
  what_to_notice: string[];
  missing_plan_data: string[];
};
