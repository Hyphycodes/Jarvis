/**
 * The six canonical, mutually-exclusive Radar categories. This is the single
 * source of truth — the DB CHECK constraint on `surfaced_items.category` mirrors
 * this list, and every write path normalizes through `normalizeRadarCategory`
 * so an invalid category can never be written.
 *
 * Disambiguation rule: ticketed + timed = events; drop-in + ongoing = culture.
 *
 * - moves   — active things to *do* (basketball, golf, a hike, a workout class)
 * - events  — ticketed & time-bound happenings (concerts, Sox games, tastings)
 * - culture — drop-in & ongoing art/intellectual (exhibits, galleries, readings)
 * - dining  — food & drink (restaurants, bars, lounges)
 * - places  — non-food spots / atmosphere (cigar lounge, hidden bar, a park, a view)
 * - finds   — products to acquire/source/upgrade (style, gear, home, travel)
 */
export const RADAR_CATEGORIES = [
  "moves",
  "events",
  "culture",
  "dining",
  "places",
  "finds",
] as const;

export type RadarCategory = (typeof RADAR_CATEGORIES)[number];

const CANONICAL = new Set<string>(RADAR_CATEGORIES);

export type RadarClassificationInput = {
  category?: string | null;
  type?: string | null;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  locationName?: string | null;
  placeType?: string | null;
  venueType?: string | null;
  entityType?: string | null;
  moveKind?: string | null;
  sequence?: string | null;
  startsAt?: string | null;
  tags?: Array<string | null | undefined> | null;
  reasons?: Array<string | null | undefined> | null;
  sourcePayload?: unknown;
};

export type RadarClassification = {
  category: RadarCategory | null;
  type: string | null;
};

// Exact single-token synonyms → canonical category. Covers the messy historical
// values (outdoors/health/general/real_estate), the IndexItemType values, and
// common subjectType / cuisine strings produced upstream.
const DIRECT: Record<string, RadarCategory> = {
  // moves — active things to do
  moves: "moves", move: "moves", activity: "moves", activities: "moves",
  outdoors: "moves", outdoor: "moves", health: "moves", fitness: "moves",
  wellness: "moves", workout: "moves", exercise: "moves", recreation: "moves",
  hike: "moves", hiking: "moves", golf: "moves", basketball: "moves",
  run: "moves", running: "moves", ritual: "moves", sport: "moves", sports: "moves",
  // events — ticketed + timed
  events: "events", event: "events", concert: "events", concerts: "events",
  music: "events", show: "events", shows: "events", festival: "events",
  festivals: "events", game: "events", games: "events", nightlife: "events",
  comedy: "events", performance: "events", gig: "events",
  // culture — drop-in + ongoing art/intellectual
  culture: "culture", cultural: "culture", art: "culture", arts: "culture",
  gallery: "culture", galleries: "culture", exhibit: "culture", exhibition: "culture",
  museum: "culture", reading: "culture", lecture: "culture", opening: "culture",
  literary: "culture", film: "culture", cinema: "culture", theater: "culture",
  theatre: "culture",
  // dining — food & drink
  dining: "dining", restaurant: "dining", restaurants: "dining", food: "dining",
  bar: "dining", bars: "dining", cafe: "dining", coffee: "dining", lounge: "dining",
  brunch: "dining", dinner: "dining", cuisine: "dining", cocktails: "dining",
  mexican: "dining", japanese: "dining", italian: "dining", mediterranean: "dining",
  steak: "dining", steakhouse: "dining", sushi: "dining", french: "dining",
  winery: "dining", wine: "dining", brewery: "dining", tavern: "dining",
  // places — non-food spots / atmosphere
  place: "places", places: "places", park: "places", parks: "places",
  shop: "places", venue: "places", view: "places", spa: "places",
  hotel: "places", cigar: "places", garden: "places", neighborhood: "places",
  trail: "places", bookstore: "places", lobby: "places",
  // finds — products to acquire. Style remains an internal source brain, but
  // the visible Radar lane is Finds.
  finds: "finds", find: "finds", style: "finds", shopping: "finds",
  product: "finds", products: "finds", fashion: "finds", apparel: "finds",
  clothing: "finds", watch: "finds", watches: "finds", drop: "finds",
  gear: "finds", retail: "finds", tops: "finds", accessory: "finds",
  accessories: "finds", sneakers: "finds",
};

// Ordered substring fallback for free-form multi-word inputs. Order encodes
// priority so atmosphere terms beat generic ones (e.g. "cigar lounge" → places,
// not dining). A `null` target means "route out of Radar" (e.g. real estate).
const KEYWORD_ORDER: Array<[RegExp, RadarCategory | null]> = [
  [/real.?estate|listing|\bland\b|homestead|\bproperty\b|\bacre/, null],
  [/cigar|rooftop|\bpark\b|garden|\bview\b|\bspa\b|hotel|boutique\b|bookstore|\blobby\b|\btrail\b|lakefront|riverwalk|neighborhood|scenic/, "places"],
  [/gallery|museum|exhibit|\bart\b|reading|lecture|opening|literary/, "culture"],
  [/concert|\bmusic\b|festival|\bshow\b|\bgame\b|ticket|comedy|nightlife|\bgig\b/, "events"],
  [/watch|\bdrop\b|sneaker|apparel|fashion|overshirt|jacket|retail|shopping|\bbuy\b/, "finds"],
  [/restaurant|dining|\bbar\b|\bcafe\b|coffee|lounge|brunch|\bfood\b|cuisine|cocktail|steak|sushi|winery|wine bar|brewery|tavern|omakase|pizzeria|pizza|bistro/, "dining"],
  [/hike|golf|basketball|workout|fitness|outdoor|wellness|\brun\b|\bgym\b|\bclass\b/, "moves"],
];

/**
 * Maps any upstream category/type/subject string to one of the six canonical
 * Radar categories, or `null` when it cannot be confidently classified or is
 * deliberately routed out of Radar (e.g. real estate). Never throws.
 */
export function normalizeRadarCategory(input?: string | null): RadarCategory | null {
  if (input == null) return null;
  const raw = String(input).trim().toLowerCase();
  if (!raw) return null;

  if (CANONICAL.has(raw)) return raw as RadarCategory;

  const token = raw.replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  if (DIRECT[token]) return DIRECT[token];
  if (DIRECT[raw]) return DIRECT[raw];

  for (const [pattern, target] of KEYWORD_ORDER) {
    if (pattern.test(raw)) return target;
  }
  return null;
}

export function isRadarCategory(value: unknown): value is RadarCategory {
  return typeof value === "string" && CANONICAL.has(value);
}

export function normalizeRadarClassification(
  input: RadarClassificationInput,
): RadarClassification {
  const payload = isRecord(input.sourcePayload) ? input.sourcePayload : {};
  const rawCategory =
    stringValue(input.category) ??
    stringValue(payload.category) ??
    stringValue(readPath(payload, ["raw_payload", "category"])) ??
    stringValue(readPath(payload, ["reason", "category"]));
  const rawType =
    stringValue(input.type) ??
    stringValue(payload.type) ??
    stringValue(readPath(payload, ["raw_payload", "type"])) ??
    stringValue(input.entityType) ??
    stringValue(payload.entity_type);
  const placeType =
    stringValue(input.placeType) ??
    stringValue(payload.place_type) ??
    stringValue(payload.placeType) ??
    stringValue(readPath(payload, ["raw_payload", "place_type"])) ??
    stringValue(readPath(payload, ["raw_payload", "quick_classification"]));
  const venueType =
    stringValue(input.venueType) ??
    stringValue(payload.venue_type) ??
    stringValue(payload.venueType) ??
    stringValue(payload.event_type) ??
    stringValue(readPath(payload, ["raw_payload", "venue_type"]));
  const moveKind =
    stringValue(input.moveKind) ??
    stringValue(payload.move_kind) ??
    stringValue(readPath(payload, ["raw_payload", "move_kind"]));
  const sequence =
    stringValue(input.sequence) ??
    stringValue(payload.sequence) ??
    stringValue(payload.route) ??
    stringValue(readPath(payload, ["raw_payload", "sequence"]));
  const explicit = normalizeRadarCategory(rawCategory) ?? normalizeRadarCategory(rawType);
  const entityType = stringValue(input.entityType) ?? stringValue(payload.entity_type);
  const blob = [
    input.title,
    input.subtitle,
    input.description,
    input.locationName,
    placeType,
    venueType,
    stringValue(payload.cuisine_or_focus),
    stringValue(payload.source_layer),
    stringValue(payload.display_category),
    stringValue(readPath(payload, ["briefing", "display_category"])),
    ...stringArray(input.tags),
    ...stringArray(input.reasons),
    ...stringArray(payload.tags),
    ...stringArray(payload.vibe_keywords),
    ...stringArray(payload.best_for),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasSequence = Boolean(sequence) || hasSequencePayload(payload) || SEQUENCE_RE.test(blob);
  const hasMoveKind = Boolean(moveKind);
  const hasMoveAction = MOVE_ACTION_RE.test(blob);
  const framedAsMove =
    (hasMoveKind && !hasDiningSignal(blob) && !hasPlaceSignal(blob)) ||
    hasSequence ||
    hasMoveAction ||
    normalizeRadarCategory(rawCategory) === "moves" &&
      !hasDiningSignal(blob) &&
      !hasPlaceSignal(blob) &&
      !hasCultureSignal(blob);

  if (isFindSignal(blob, rawCategory, rawType, entityType)) return byCategory("finds");
  if (isOfficialEvent(input.startsAt, explicit, rawType, entityType, blob, payload)) {
    return byCategory("events");
  }
  if (hasCultureSignal(blob)) return byCategory("culture");
  if (hasDiningSignal(blob)) return byCategory("dining");
  if (hasPlaceSignal(blob) && !hasSequence && !hasMoveAction) return byCategory("places");
  if (framedAsMove) return byCategory("moves");
  if (explicit) return byCategory(explicit);
  if (entityType === "event") return byCategory("events");
  if (entityType === "source") return { category: null, type: rawType ?? null };
  if (entityType === "place") return byCategory("places");
  const derived = normalizeRadarCategory(blob);
  return derived ? byCategory(derived) : { category: null, type: rawType ?? null };
}

export function typeForRadarCategory(category: RadarCategory): string {
  switch (category) {
    case "dining":
      return "restaurant";
    case "events":
      return "event";
    case "culture":
      return "culture";
    case "places":
      return "place";
    case "finds":
      return "product";
    case "moves":
      return "move";
  }
}

export function labelForRadarCategory(category: RadarCategory | string | null | undefined): string | undefined {
  const normalized = normalizeRadarCategory(category);
  if (!normalized) return undefined;
  switch (normalized) {
    case "dining":
      return "Dining";
    case "events":
      return "Event";
    case "culture":
      return "Culture";
    case "places":
      return "Places";
    case "finds":
      return "Finds";
    case "moves":
      return "Move";
  }
}

const SEQUENCE_RE = /\b(then|after|start(?:ing)? at|finish|end at|route|loop|circuit|stop\s+\d|first|next|walk to|drive to|followed by|itinerary)\b/i;
const MOVE_ACTION_RE = /\b(walk|route|loop|run|ride|bike|hike|workout|boxing|basketball|shootaround|golf|class|lesson|errands?|flow|tour|horseback|horse riding|trail ride|pickleball|tennis|pilates|yoga|range|court|league)\b/i;
const DINING_RE = /\b(restaurant|dining|supper|dinner|brunch|lunch|bar|cafe|coffee|coffeehouse|lounge|cocktail|wine bar|winery|brewery|brewpub|tavern|steakhouse|sushi|omakase|pizzeria|pizza|bistro|kitchen|chef|tasting room|taqueria|bakery)\b/i;
const PLACE_RE = /\b(hotel|inn|lobby|park|trail|lakefront|riverwalk|waterfront|beach|garden|neighborhood|scenic|view|bookstore|book shop|boutique|record shop|wine shop|gift shop|galleria|artisan market|cigar lounge|cigar room|cigar|spa|plaza|promenade|lookout|observatory)\b/i;
const CULTURE_RE = /\b(museum|gallery|exhibit|exhibition|architecture|architectural|design|film|cinema|craftsmanship|opera|theater|theatre|fine arts|cultural center|biennial|art institute|installation|screening|artist|symphony|orchestra|orchestral|philharmonic|classical|recital|chamber music|ballet|conservatory|jazz club|jazz room|jazz lounge|listening bar|listening room|live music|music room|music venue|concert hall|concert venue|performing arts|jazz archive)\b/i;
const FIND_RE = /\b(product|watch|sneaker|apparel|fashion|overshirt|jacket|retail|shopping|buy|purchase|acquire|drop|gear|wardrobe|shirt|denim|bag|luggage|homeware)\b/i;
const EVENT_RE = /\b(ticket|tickets|concert|show|festival|game|performance|comedy|screening|opening night|tasting event|event|live at|dj set)\b/i;

function byCategory(category: RadarCategory): RadarClassification {
  return { category, type: typeForRadarCategory(category) };
}

function hasDiningSignal(value: string): boolean {
  return DINING_RE.test(value) && !/\bcigar lounge\b|\bcigar room\b|\blobby\b/i.test(value);
}

function hasPlaceSignal(value: string): boolean {
  return PLACE_RE.test(value);
}

function hasCultureSignal(value: string): boolean {
  return CULTURE_RE.test(value);
}

function isFindSignal(blob: string, category?: string | null, type?: string | null, entityType?: string | null): boolean {
  return (
    normalizeRadarCategory(category) === "finds" ||
    normalizeRadarCategory(type) === "finds" ||
    entityType === "product" ||
    FIND_RE.test(blob)
  );
}

function isOfficialEvent(
  startsAt: string | null | undefined,
  explicit: RadarCategory | null,
  type: string | null | undefined,
  entityType: string | null | undefined,
  blob: string,
  payload: Record<string, unknown>,
): boolean {
  const eventTyped =
    explicit === "events" ||
    normalizeRadarCategory(type) === "events" ||
    entityType === "event" ||
    EVENT_RE.test(blob);
  return eventTyped && (Boolean(startsAt) || Boolean(payload.official_starts_at) || Boolean(payload.event_time_locked));
}

function hasSequencePayload(payload: Record<string, unknown>): boolean {
  return Boolean(
    payload.sequence ||
      payload.route ||
      payload.steps ||
      payload.itinerary ||
      readPath(payload, ["raw_payload", "sequence"]) ||
      readPath(payload, ["raw_payload", "route"]) ||
      readPath(payload, ["raw_payload", "steps"]),
  );
}

function readPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const part of path) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
