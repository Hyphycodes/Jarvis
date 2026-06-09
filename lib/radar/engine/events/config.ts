/**
 * Events engine — sub-library config + classification + shared brain-tree types
 * (per jarvis-events-engine-brain-tree.md). Four sub-libraries over ONE warehouse
 * (current_events.sub_library), each with its own specialist sources + domain brief.
 *
 * Pure + dependency-light so it's unit-testable and importable anywhere.
 */

import { normalizeExternalId } from "@/lib/radar/engine/curation";
import type { SerpGoogleEventResult } from "@/lib/sources/serpapi";

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

// ── SerpAPI Google Events date parsing ───────────────────────────────────────

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse SerpAPI Google Events dates into an ISO instant. SerpAPI's `when` carries
 * the real start time but in a loose, human format ("Tue, Dec 9, 6 – 9 PM"); we
 * read month/day + the START time (the meridiem on a range applies to the start),
 * and FALL BACK to the clean `start_date` ("Dec 9") when `when` has no parseable
 * time. A dated listing with no time defaults to 19:00 local — a real evening
 * window, never a fake T00:00 (which the readiness contract rejects). Times are
 * resolved as America/Chicago wall-clock so "Add to Calendar" keeps the real time.
 * Rolls to next year when the month/day already passed.
 */
export function parseSerpEventDate(
  when: string | null,
  startDate: string | null,
  tz = "America/Chicago",
): string | null {
  const now = Date.now();
  for (const raw of [when, startDate]) {
    const parsed = readMonthDayTime(raw);
    if (!parsed) continue;
    for (const year of [new Date().getFullYear(), new Date().getFullYear() + 1]) {
      const iso = zonedWallToUtcISO(year, parsed.month, parsed.day, parsed.hour, parsed.minute, tz);
      if (iso && new Date(iso).getTime() > now - 24 * 60 * 60 * 1000) return iso;
    }
  }
  return null;
}

/** Read month, day, and the start time from a SerpAPI date string. Time is
 *  optional → defaults to a 19:00 evening window for a date-only listing. */
function readMonthDayTime(
  raw: string | null,
): { month: number; day: number; hour: number; minute: number } | null {
  if (!raw) return null;
  const s = raw.replace(/^\s*[A-Za-z]{3,9},\s*/, " ").trim(); // drop leading weekday
  const md = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\b/);
  if (!md) return null;
  const month = MONTH_INDEX[md[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const day = parseInt(md[2], 10);
  if (!(day >= 1 && day <= 31)) return null;

  // The start time lives AFTER the month/day; a range's meridiem ("6 – 9 PM")
  // applies to the start. Default to 19:00 when no real time is present.
  const rest = s.slice((md.index ?? 0) + md[0].length);
  const merid = (rest.match(/([ap])\.?m\.?/i)?.[1] ?? "").toLowerCase();
  const tm = rest.match(/(\d{1,2})(?::(\d{2}))?/);
  let hour = 19;
  let minute = 0;
  if (tm) {
    hour = parseInt(tm[1], 10);
    minute = tm[2] ? parseInt(tm[2], 10) : 0;
    if (merid === "p" && hour < 12) hour += 12;
    else if (merid === "a" && hour === 12) hour = 0;
    else if (!merid && hour <= 11) hour += 12; // bare event hour → assume evening
    if (hour > 23 || minute > 59) {
      hour = 19;
      minute = 0;
    }
  }
  return { month, day, hour, minute };
}

/** Wall-clock components in `tz` → UTC ISO (DST-aware). Runtime-timezone
 *  independent: derives the tz offset at that instant via Intl.formatToParts,
 *  so it is correct whether the process runs in UTC (Vercel) or any local tz. */
function zonedWallToUtcISO(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): string | null {
  const guess = Date.UTC(year, month, day, hour, minute);
  if (!Number.isFinite(guess)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  if (!Number.isFinite(asUtc)) return new Date(guess).toISOString();
  return new Date(guess - (asUtc - guess)).toISOString();
}

/**
 * True when an event timestamp carries a REAL clock time (not a date-only
 * listing). The signal for "no real time" is the wall clock in the event's
 * timezone being exactly midnight — judged in LOCAL time, never UTC. A 7 PM
 * Chicago show is 00:00 UTC but 19:00 local; the old UTC-string `T00:00` check
 * wrongly killed exactly those prime evening events. Defaults to America/Chicago
 * (the owner's city); pass a tz for other locales.
 */
export function hasRealEventTime(value: string | null | undefined, tz = "America/Chicago"): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return hm !== "00:00";
}

// ── SerpAPI event → candidate (pure: parse + classify + reject reason) ─────────

export type EventCandidateReason = "no_title" | "no_venue" | "no_date";

export type EventCandidate = {
  title: string;
  venue: string;
  startsAt: string;
  subLibrary: EventSubLibrary;
  eventType: string;
  ticketUrl: string | null;
  imageUrl: string | null;
  description: string | null;
  link: string | null;
  externalId: string;
};

/** Turn one SerpAPI Google Events result into an insertable candidate, or a
 *  concrete rejection reason. Pure — drives both the scout and its unit tests. */
export function parseSerpEventCandidate(
  ev: SerpGoogleEventResult,
): { ok: true; candidate: EventCandidate } | { ok: false; reason: EventCandidateReason } {
  const title = ev.title?.trim();
  if (!title) return { ok: false, reason: "no_title" };
  const venue = ev.venue?.name?.trim() || (ev.address ?? [])[0]?.trim() || null;
  if (!venue) return { ok: false, reason: "no_venue" };
  const startsAt = parseSerpEventDate(ev.date?.when ?? null, ev.date?.start_date ?? null);
  if (!startsAt) return { ok: false, reason: "no_date" };

  const subLibrary = classifyEventSubLibrary({
    title,
    description: ev.description ?? null,
    venue_name: venue,
  });
  const ticketUrl =
    (ev.ticket_info ?? []).find((t) => isHttp(t.link))?.link ?? (isHttp(ev.link) ? ev.link! : null);
  return {
    ok: true,
    candidate: {
      title,
      venue,
      startsAt,
      subLibrary,
      eventType: eventTypeForSub(subLibrary),
      ticketUrl,
      imageUrl: isHttp(ev.thumbnail) ? ev.thumbnail! : null,
      description: ev.description ?? null,
      link: ev.link ?? null,
      externalId: normalizeExternalId(`${title}-${venue}-${startsAt.slice(0, 10)}`),
    },
  };
}

export function eventTypeForSub(sub: EventSubLibrary): string {
  switch (sub) {
    case "events_music":
      return "live_music";
    case "events_food":
      return "chef_dinner";
    case "events_art":
      return "art_opening";
    case "events_outdoor":
      return "other";
  }
}

/** Why the Events lane is empty (or null if it isn't), from a health snapshot.
 *  Distinguishes images-missing vs verified-but-unrendered vs awaiting-verify vs
 *  no-source — so an empty lane is never a mystery. */
export function eventsLanePrimaryEmptyReason(
  h: { readyShown: number; shown: number; imageMissing: number; verifiedReserve: number; pending: number },
  scoutReason?: string,
): string | null {
  if (h.readyShown > 0) return null;
  if (h.imageMissing > 0 && h.imageMissing >= h.shown) return "images_missing";
  if (h.verifiedReserve > 0) return "verified_not_rendered";
  if (h.pending > 0) return "awaiting_verification";
  return scoutReason && scoutReason !== "ok" ? `no_source:${scoutReason}` : "no_source";
}

function isHttp(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}
