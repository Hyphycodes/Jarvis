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
 * - style   — products to acquire (drops, a watch, the right overshirt)
 */
export const RADAR_CATEGORIES = [
  "moves",
  "events",
  "culture",
  "dining",
  "places",
  "style",
] as const;

export type RadarCategory = (typeof RADAR_CATEGORIES)[number];

const CANONICAL = new Set<string>(RADAR_CATEGORIES);

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
  // places — non-food spots / atmosphere
  place: "places", places: "places", park: "places", parks: "places",
  shop: "places", venue: "places", view: "places", spa: "places",
  hotel: "places", cigar: "places", garden: "places", neighborhood: "places",
  // style — products to acquire
  style: "style", shopping: "style", product: "style", products: "style",
  fashion: "style", apparel: "style", clothing: "style", watch: "style",
  watches: "style", drop: "style", gear: "style", retail: "style",
  tops: "style", accessory: "style", accessories: "style", sneakers: "style",
};

// Ordered substring fallback for free-form multi-word inputs. Order encodes
// priority so atmosphere terms beat generic ones (e.g. "cigar lounge" → places,
// not dining). A `null` target means "route out of Radar" (e.g. real estate).
const KEYWORD_ORDER: Array<[RegExp, RadarCategory | null]> = [
  [/real.?estate|listing|\bland\b|homestead|\bproperty\b|\bacre/, null],
  [/cigar|speakeasy|hidden bar|rooftop|\bpark\b|garden|\bview\b|\bspa\b|hotel|boutique\b/, "places"],
  [/gallery|museum|exhibit|\bart\b|reading|lecture|opening|literary/, "culture"],
  [/concert|\bmusic\b|festival|\bshow\b|\bgame\b|ticket|comedy|nightlife|\bgig\b/, "events"],
  [/watch|\bdrop\b|sneaker|apparel|fashion|overshirt|jacket|retail|shopping|\bbuy\b/, "style"],
  [/restaurant|dining|\bbar\b|\bcafe\b|coffee|lounge|brunch|\bfood\b|cuisine|cocktail|steak|sushi/, "dining"],
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
