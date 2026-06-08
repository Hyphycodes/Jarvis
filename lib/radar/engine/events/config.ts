/**
 * Events engine — sub-library config + classification + shared brain-tree types
 * (per jarvis-events-engine-brain-tree.md). Four sub-libraries over ONE warehouse
 * (current_events.sub_library), each with its own specialist sources + domain brief.
 *
 * Pure + dependency-light so it's unit-testable and importable anywhere.
 */

export type EventSubLibrary =
  | "events_music"
  | "events_food"
  | "events_art"
  | "events_outdoor";

export const EVENT_SUBLIBRARIES: EventSubLibrary[] = [
  "events_music",
  "events_food",
  "events_art",
  "events_outdoor",
];

export type EventSubLibraryConfig = {
  subLibrary: EventSubLibrary;
  label: string;
  /** event_type values that belong here. */
  eventTypes: string[];
  /** Example sub_types the scout tags. */
  subTypes: string[];
  /** Specialist sources to fish first (scout may discover more). */
  specialistSources: string[];
  /** Domain-expertise brief — what "good" means here + the axes that matter most. */
  brief: string;
};

export const EVENTS_SUBLIBRARIES: Record<EventSubLibrary, EventSubLibraryConfig> = {
  events_music: {
    subLibrary: "events_music",
    label: "Music",
    eventTypes: ["dj_set", "live_music"],
    subTypes: ["jazz", "classical", "symphony", "dj_set", "house", "latin", "listening_room", "live_band", "festival"],
    specialistSources: [
      "Chicago Reader music", "Resident Advisor", "Do312", "Empty Bottle", "Sleeping Village",
      "Thalia Hall", "Green Mill", "Jazz Showcase", "Symphony Center / CSO", "Constellation", "Metro",
    ],
    brief:
      "You judge REAL shows over promoted nightlife: musical credibility, venue soul, sound/room quality, " +
      "DJ/artist ear, cultural depth, and whether it's worth leaving the house. Kill generic club promos, " +
      "bottle-service nightlife, and vague 'live music tonight' with no named act/time/source. Axes that " +
      "matter most: musical credibility, venue soul, crowd fit, timing, rarity/urgency, not-scene-driven.",
  },
  events_food: {
    subLibrary: "events_food",
    label: "Food",
    eventTypes: ["wine_event", "chef_dinner"],
    subTypes: ["wine_dinner", "chef_popup", "tasting_menu", "collab_dinner", "underground_dinner", "pairing_event"],
    specialistSources: [
      "Eater Chicago events", "Resy event pages", "Tock", "Chicago Reader food",
      "restaurant websites", "winery/wine-shop calendars", "chef/operator pages",
    ],
    brief:
      "You judge real chef-driven events over Instagram food moments: culinary identity, whether the menu " +
      "is actually interesting, price/value vs gimmick, room energy, and spend-posture fit. Kill vague food " +
      "festivals, overhyped influencer pop-ups, and undated restaurant recs pretending to be events. Axes: " +
      "chef/food credibility, menu identity, price/value, reservation/ticket actionability, rarity, not-touristy.",
  },
  events_art: {
    subLibrary: "events_art",
    label: "Art",
    eventTypes: ["art_opening"],
    subTypes: ["gallery_opening", "museum_event", "artist_talk", "design_event", "architecture", "lecture", "film_crossover"],
    specialistSources: [
      "Art Institute of Chicago", "MCA Chicago", "Chicago Gallery News", "Chicago Reader arts",
      "architecture/design calendars", "university art/design events",
    ],
    brief:
      "You judge real work over opening-night scene: cultural value, originality, depth, taste-stretch, and " +
      "conversation potential — whether it deepens taste and is worth attending LIVE vs just reading about. " +
      "Kill generic art parties and weak openings with no artist/exhibit detail. An UNDATED exhibit belongs " +
      "in Culture, not Events. Axes: artistic/cultural value, originality, depth, institution credibility, taste stretch.",
  },
  events_outdoor: {
    subLibrary: "events_outdoor",
    label: "Outdoor",
    eventTypes: [],
    subTypes: ["festival", "park_event", "lakefront", "market", "outdoor_screening", "summer_concert", "community"],
    specialistSources: [
      "Chicago Park District", "Choose Chicago events", "Do312 outdoor", "neighborhood calendars",
      "festival pages", "outdoor screening series",
    ],
    brief:
      "You judge seasonal Chicago value vs generic festival listings: weather fit, crowd/friction, distance/" +
      "parking, and whether it's worth dealing with the city. Weather-dependent events pause on bad-weather days. " +
      "Axes: seasonal value, weather fit, crowd/friction, location, free/paid value, uniqueness, expiration urgency.",
  },
};

// ── Classification ─────────────────────────────────────────────────────────────
// event_type wins; otherwise keyword rules, ordered most-specific first so an
// outdoor festival or an art talk isn't swallowed by the music catch-all.

const OUTDOOR_RE = /\b(festival|park|lakefront|riverwalk|beach|market|outdoor|open[- ]air|screening in the park|street fest|block party|fireworks|summer series)\b/i;
const ART_RE = /\b(gallery|museum|exhibit|exhibition|opening|artist talk|lecture|architecture|design|biennial|installation|art institute|mca|after[- ]hours)\b/i;
const FOOD_RE = /\b(wine dinner|chef|tasting menu|pop[- ]up|collaboration dinner|supper club|pairing|whiskey|cocktail dinner|prix fixe|food fest|brunch event)\b/i;
const MUSIC_RE = /\b(concert|dj|jazz|symphony|orchestra|classical|live music|band|listening|residency|set|gig|salsa|house music|vinyl)\b/i;

export function classifyEventSubLibrary(input: {
  event_type?: string | null;
  title?: string | null;
  description?: string | null;
  venue_name?: string | null;
  vibe_keywords?: string[] | null;
}): EventSubLibrary {
  const type = (input.event_type ?? "").toLowerCase().trim();
  for (const cfg of Object.values(EVENTS_SUBLIBRARIES)) {
    if (type && cfg.eventTypes.includes(type)) return cfg.subLibrary;
  }
  const blob = [
    input.title,
    input.description,
    input.venue_name,
    ...(input.vibe_keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (OUTDOOR_RE.test(blob)) return "events_outdoor";
  if (ART_RE.test(blob)) return "events_art";
  if (FOOD_RE.test(blob)) return "events_food";
  if (MUSIC_RE.test(blob)) return "events_music";
  // Unknown → music is the most common live-event bucket; the council/editor sort quality.
  return "events_music";
}

export function isEventSubLibrary(value: unknown): value is EventSubLibrary {
  return typeof value === "string" && (EVENT_SUBLIBRARIES as string[]).includes(value);
}

// ── Shared brain-tree decision types (produced by assess.ts + council.ts) ───────

export type EventSourceQuality = "official" | "trusted" | "partial" | "weak" | "unknown";

export type EventTruthAssessment = {
  exists_confidence: number;
  datetime_confidence: number;
  venue_confidence: number;
  source_quality: EventSourceQuality;
  source_url?: string | null;
  ticket_url?: string | null;
  verified_facts: string[];
  unsupported_claims: string[];
  needs_enrichment: boolean;
};

export type EventTimingFit = "today" | "this_week" | "later" | "bad_timing";
export type EventSurface = "today" | "radar" | "reserve" | "suppress";

export type EventFitAssessment = {
  fit_score: number;
  timing_fit: EventTimingFit;
  friction_level: "low" | "medium" | "high" | "unknown";
  budget_fit: "comfortable" | "premium_but_ok" | "stretch" | "bad_fit" | "unknown";
  recommended_surface: EventSurface;
  reasons: string[];
  vetoes: string[];
};

export type EventUrgency = "now" | "soon" | "normal" | "low" | "expired";
export type EventUrgencyAssessment = {
  urgency: EventUrgency;
  action_deadline?: string | null;
  reason: string;
};

export type EventPlanabilityAssessment = {
  plan_ready: boolean;
  suggested_arrival?: string | null;
  before_options: string[];
  after_options: string[];
  logistics_notes: string[];
  missing_plan_data: string[];
};
