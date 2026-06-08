/**
 * Places engine — sub-library config + classification + shared brain-tree types
 * (per jarvis-places-engine-brain-tree.md). Places are spatial assets (rooms,
 * zones, neighborhoods, outdoor spaces), EVERGREEN, with a ROLE brain (what role
 * the place plays in Jerry's life). Warehouse = places_items.sub_library.
 *
 * Pure + dependency-light so it's unit-testable.
 */

export type PlaceSubLibrary = "places_neighborhoods" | "places_venues" | "places_outdoor";

export const PLACE_SUBLIBRARIES: PlaceSubLibrary[] = [
  "places_neighborhoods",
  "places_venues",
  "places_outdoor",
];

export type PlaceSubLibraryConfig = {
  subLibrary: PlaceSubLibrary;
  label: string;
  subTypes: string[];
  specialistSources: string[];
  queries: string[];
  brief: string;
};

export const PLACES_SUBLIBRARIES: Record<PlaceSubLibrary, PlaceSubLibraryConfig> = {
  places_neighborhoods: {
    subLibrary: "places_neighborhoods",
    label: "Neighborhoods",
    subTypes: ["drift_zone", "corridor", "heritage_block", "waterfront_area", "after_dinner_zone"],
    specialistSources: ["Chicago neighborhood guides", "local blogs", "architecture/design maps", "city guides"],
    queries: ["best Chicago neighborhood to walk {city}", "Chicago corridor worth exploring {city}"],
    brief:
      "You judge block-level feel over tourist pages: whether a zone is alive vs overhyped, fits real movement " +
      "patterns, and is a destination vs a drift ingredient. Kill generic 'visit Wicker Park' with no angle. " +
      "Axes: neighborhood fit, drift potential, nearby density, atmosphere, repeatability, parking/friction.",
  },
  places_venues: {
    subLibrary: "places_venues",
    label: "Venues",
    subTypes: ["hotel_lobby", "lounge", "bookstore", "library", "cigar_room", "interior", "quiet_room", "work_space"],
    specialistSources: ["hotel/venue websites", "architecture/interior editorial", "bookstore/library listings", "cigar/lounge guides"],
    queries: ["best hotel lobby to sit Chicago {city}", "great bookstore Chicago {city}"],
    brief:
      "You judge the ROOM itself: atmosphere, interior quality, comfort, whether it's usable without being awkward, " +
      "and quiet-luxury vs flashy. A restaurant/bar where food/drink is the point is Dining, not here; a museum is " +
      "Culture. Kill generic hotel filler and bottle-service lounges. Axes: room atmosphere, visual quality, comfort, " +
      "low-pressure usefulness, refined energy, photo/story potential.",
  },
  places_outdoor: {
    subLibrary: "places_outdoor",
    label: "Outdoor",
    subTypes: ["park", "trail", "lakefront", "riverwalk", "garden", "scenic_overlook", "plaza", "cigar_walk_zone"],
    specialistSources: ["Chicago Park District", "outdoor Chicago editorial", "walking guides", "photography/location guides"],
    queries: ["scenic lakefront spot Chicago {city}", "best park to walk Chicago {city}"],
    brief:
      "You judge seasonal/weather value and scenery: walkability, photo potential, crowd risk, and low-friction " +
      "reset value. An outdoor space with a route/action as the point is a Move; a dated outdoor happening is an Event. " +
      "Axes: outdoor quality, seasonal/weather fit, scenery, repeatability, photo potential, low-pressure usefulness.",
  },
};

// ── Roles (the Places-specific layer) ───────────────────────────────────────────
export const PLACE_ROLES = [
  "destination",
  "drift_zone",
  "second_stop",
  "quiet_reset",
  "photo_location",
  "meeting_spot",
  "date_context",
  "friend_context",
  "family_context",
  "solo_context",
  "creative_input",
  "neighborhood_anchor",
  "before_after_plan",
  "cigar_walk_zone",
  "low_friction_fallback",
  "seasonal_place",
] as const;
export type PlaceRole = (typeof PLACE_ROLES)[number];

// ── Classification ─────────────────────────────────────────────────────────────
const OUTDOOR_RE = /\b(park|trail|lakefront|riverwalk|river walk|beach|garden|scenic|overlook|plaza|promenade|waterfront|outdoor|nature)\b/i;
const NEIGHBORHOOD_RE = /\b(neighborhood|corridor|district|\bzone\b|\barea\b|blocks?|pocket|stretch)\b/i;
const VENUE_RE = /\b(hotel|lobby|lounge|bookstore|book shop|library|cigar|interior|room|cafe space|work space|atrium|conservatory indoor)\b/i;

export function classifyPlaceSubLibrary(input: {
  title?: string | null;
  place_type?: string | null;
  description?: string | null;
  vibe_keywords?: string[] | null;
}): PlaceSubLibrary {
  const type = (input.place_type ?? "").toLowerCase();
  if (type === "outdoor") return "places_outdoor";
  if (type === "neighborhood") return "places_neighborhoods";
  const blob = [input.title, input.place_type, input.description, ...(input.vibe_keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (OUTDOOR_RE.test(blob)) return "places_outdoor";
  if (NEIGHBORHOOD_RE.test(blob)) return "places_neighborhoods";
  if (VENUE_RE.test(blob)) return "places_venues";
  return "places_venues";
}

export function isPlaceSubLibrary(value: unknown): value is PlaceSubLibrary {
  return typeof value === "string" && (PLACE_SUBLIBRARIES as string[]).includes(value);
}

// ── Shared brain-tree decision types ────────────────────────────────────────────

export type PlaceSourceQuality = "verified" | "strong" | "partial" | "weak" | "unknown";

export type PlaceTruthAssessment = {
  exists_confidence: number;
  location_confidence: number;
  identity_confidence: number;
  source_quality: PlaceSourceQuality;
  google_place_id?: string | null;
  source_url?: string | null;
  verified_facts: string[];
  unsupported_claims: string[];
  needs_enrichment: boolean;
};

export type PlaceSurface = "today" | "radar" | "reserve" | "suppress";

export type PlaceFitAssessment = {
  fit_score: number;
  timing_fit: "today" | "this_week" | "later" | "bad_timing";
  friction_level: "low" | "medium" | "high" | "unknown";
  recommended_surface: PlaceSurface;
  reasons: string[];
  vetoes: string[];
};

export type PlaceRoleAssessment = {
  primary_role: PlaceRole;
  secondary_roles: PlaceRole[];
  best_use_case: string;
  not_for: string[];
  repeatability: "high" | "medium" | "low";
};

export type PlacePlanabilityAssessment = {
  plan_ready: boolean;
  best_time?: string | null;
  suggested_duration?: string | null;
  nearby_pairings: string[];
  logistics_notes: string[];
  missing_plan_data: string[];
};
