/**
 * buildPlanBrief — the editorial shaper.
 *
 * Takes a LoadedPlan (preferred — from `loadPlanBySlugV2`) and emits a
 * PlanBrief that the new Plan UI consumes. Truth-aware: never invents
 * weather / parking / contacts / addresses. When data is missing, the
 * builder pulls from `planCopyBanks` so every page is honest AND warm.
 *
 * The function is pure — server-only because LoadedPlan is — but it
 * makes no network calls. Imports stay light.
 */

import "server-only";

import type {
  LoadedPlan,
  LoadedPlanSection,
  LoadedPlanTimelineItem,
} from "@/lib/plans/loadPlan";
import {
  beforeBank,
  categoryLabel,
  chapterConfirmationFallback,
  chapterCopy,
  FALLBACK_MOVE_ITEMS,
  INFO_STRIP_FALLBACK,
  quoteFor,
  summaryFor,
} from "@/lib/plans/planCopyBanks";
import type {
  PlanBrief,
  PlanCategory,
  PlanChapter,
  PlanChapterKey,
  PlanInfoBlock,
  PlanLightSection,
  PlanMoveItem,
  PlanState,
} from "@/lib/plans/planBrief";
import { mapsSearchUrl, reservationLink } from "@/lib/plans/venueLinks";

// ── Public entry ─────────────────────────────────────────────────────────────

export type BuildPlanBriefInput = {
  loaded: LoadedPlan;
  /** Optional override when the caller knows where the user navigated from. */
  sourceType?: "today" | "radar" | "event" | "sample";
};

export function buildPlanBrief(input: BuildPlanBriefInput): PlanBrief {
  const { loaded } = input;
  const missing: string[] = [];
  const assumed: string[] = [];

  const category = inferCategory(loaded);
  const state = inferState(loaded);
  const summary = shapeSummary(loaded, category);
  // Effective target start: a committed schedule, else the brain's suggested_start.
  // Drives the date/time labels, Leave By, and the Weather target.
  const targetStart = computeTargetStart(loaded);
  const dateLabel = cleanText(loaded.dateLabel) ?? targetDateLabel(targetStart);
  const timeLabel = targetTimeLabel(targetStart) ?? shapeTimeLabel(loaded, assumed);
  const neighborhood = cleanText(loaded.neighborhood);
  const areaLabel = neighborhood ?? shapeArea(loaded);
  const locationLabel = cleanText(loaded.locationLine ?? loaded.locationName);
  const venueLinks = buildVenueLinks(loaded);

  const sectionsByType = indexSections(loaded.sections);

  const infoStrip = buildInfoStrip({
    loaded,
    timeLabel,
    missing,
  });

  const chapters = buildChapters({
    slug: loaded.slug,
    loaded,
    sectionsByType,
  });

  const before = buildBefore({ loaded, category, sectionsByType });
  const move = buildMove({ loaded, category });
  const atmosphere = buildLightSection({
    key: "atmosphere",
    sectionsByType,
    loaded,
  });
  const details = buildLightSection({
    key: "details",
    sectionsByType,
    loaded,
  });
  const detours = buildLightSection({
    key: "detours",
    sectionsByType,
    loaded,
  });
  const after = buildLightSection({
    key: "after",
    sectionsByType,
    loaded,
  });

  const quote = {
    body: pickQuote(loaded, category),
    attribution: "— J.",
  };

  return {
    slug: loaded.slug,
    planId: loaded.id,
    sourceId: loaded.sourceItemId,
    sourceType: input.sourceType,
    title: cleanText(loaded.title) ?? "Plan",
    category,
    shape: loaded.shape ?? "experience",
    isSequential: loaded.isSequential ?? false,
    dateLabel,
    timeLabel: timeLabel ?? scheduledTimeLabel(loaded),
    areaLabel,
    locationLabel,
    neighborhood,
    targetStart,
    venueLinks,
    scheduledDate: loaded.scheduledDate,
    scheduledTime: loaded.scheduledTime,
    scheduleFixed: loaded.scheduleFixed,
    buildStatus: loaded.buildStatus,
    heroImage: undefined,
    summary,
    state,
    confidence: loaded.confidence,
    fallbackUsed: loaded.fallbackUsed,
    sectionCount: loaded.sectionCount,
    infoStrip,
    chapters,
    before,
    move,
    atmosphere,
    details,
    detours,
    after,
    quote,
    truth: { missing, assumed },
  };
}

// ── Category inference ──────────────────────────────────────────────────────

function inferCategory(loaded: LoadedPlan): PlanCategory {
  const type = (loaded.planType ?? "general").toLowerCase();
  switch (type) {
    case "dining":
      return "dining";
    case "event":
    case "culture":
    case "music":
      return "social";
    case "style":
    case "product":
    case "purchase":
    case "watch":
      return "purchase";
    case "travel":
      return "travel";
    case "fitness":
    case "health":
    case "wellness":
      return "wellness";
    case "creative":
      return "creative";
    case "family":
      return "family";
    case "errand":
      return "errand";
    case "work":
      return "work";
    default:
      return "unknown";
  }
}

// ── State inference ─────────────────────────────────────────────────────────

function inferState(loaded: LoadedPlan): PlanState {
  if (loaded.liveEnabled || loaded.status === "active") return "live";
  if (loaded.status === "completed") return "after";
  if (loaded.status === "cancelled") return "holding";
  if (loaded.status === "draft") return "ready";
  return "ready";
}

// ── Summary shaping ─────────────────────────────────────────────────────────

function shapeSummary(loaded: LoadedPlan, category: PlanCategory): string {
  const candidates = [
    loaded.heroAngle,
    loaded.whyThisFits,
    loaded.summary,
    loaded.primaryMove,
  ];
  for (const c of candidates) {
    const cleaned = cleanText(c);
    if (cleaned && cleaned.length > 8 && !isMechanical(cleaned)) {
      return cleaned;
    }
  }
  return summaryFor(category);
}

// ── Time / area shaping ─────────────────────────────────────────────────────

function shapeTimeLabel(loaded: LoadedPlan, assumed: string[]): string | undefined {
  const direct = cleanText(loaded.timeWindow);
  if (direct) return direct;
  if (loaded.bestWindow) {
    const cleaned = cleanText(loaded.bestWindow);
    if (cleaned) {
      assumed.push("time-label-from-best-window");
      return cleaned;
    }
  }
  return undefined;
}

/** Fallback time label from a scheduled_time (HH:MM 24h) when no window exists. */
function scheduledTimeLabel(loaded: LoadedPlan): string | undefined {
  if (!loaded.scheduledTime) return undefined;
  const [h, m] = loaded.scheduledTime.split(":").map(Number);
  if (Number.isNaN(h)) return undefined;
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${meridiem}`;
}

function shapeArea(loaded: LoadedPlan): string | undefined {
  // Prefer just the neighborhood/city, not full address.
  const line = cleanText(loaded.locationLine);
  if (!line) return undefined;
  // If the line is a street address, return the comma tail.
  const parts = line.split(/[,•·]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return line;
  // Take the last 1-2 parts (e.g. "West Loop, Chicago").
  return parts.slice(-2).join(", ");
}

// ── Target time + venue links ────────────────────────────────────────────────

/** Effective target start: committed schedule → key_stats.starts_at → brain suggested_start. */
function computeTargetStart(loaded: LoadedPlan): string | undefined {
  if (loaded.scheduledDate) {
    const time = loaded.scheduledTime ?? "19:30";
    const d = new Date(`${loaded.scheduledDate}T${time}:00`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const keyStats = isRecord(loaded.keyStats) ? loaded.keyStats : {};
  if (typeof keyStats.starts_at === "string") {
    const d = new Date(keyStats.starts_at);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (loaded.suggestedStart) {
    const d = new Date(loaded.suggestedStart);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return undefined;
}

function targetDateLabel(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function targetTimeLabel(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function buildVenueLinks(loaded: LoadedPlan): PlanBrief["venueLinks"] {
  const venueName = cleanText(loaded.locationName ?? loaded.title) ?? "";
  const venueQuery = [venueName, cleanText(loaded.neighborhood)].filter(Boolean).join(" ");
  const mapsQuery =
    cleanText(loaded.mapsQuery) ??
    [venueName, cleanText(loaded.address) ?? cleanText(loaded.neighborhood)]
      .filter(Boolean)
      .join(", ");
  const keyStats = isRecord(loaded.keyStats) ? loaded.keyStats : {};
  const reservation = isRecord(keyStats.reservation) ? keyStats.reservation : {};
  const reserve = reservationLink({
    url: typeof reservation.bookingUrl === "string" ? reservation.bookingUrl : undefined,
    platform: typeof reservation.platform === "string" ? reservation.platform : undefined,
    venueQuery: venueQuery || venueName,
  });
  const links = {
    address: cleanText(loaded.address),
    mapsUrl: mapsQuery ? mapsSearchUrl(mapsQuery) : undefined,
    officialUrl: cleanText(loaded.officialUrl),
    phone: cleanText(loaded.phone),
    reservationUrl: reserve?.url,
    reservationLabel: reserve?.label,
    parkingNote: cleanText(loaded.parkingNote),
  };
  return Object.values(links).some(Boolean) ? links : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── InfoStrip ───────────────────────────────────────────────────────────────

function buildInfoStrip(input: {
  loaded: LoadedPlan;
  timeLabel?: string;
  missing: string[];
}): PlanInfoBlock[] {
  const { loaded, timeLabel, missing } = input;

  // 1. Leave by — derived from timeLabel when possible, else fallback
  const leaveBy = deriveLeaveBy(timeLabel);
  if (!leaveBy) missing.push("leave_by");

  // 2. Weather — only when LoadedPlan has it in key_stats (the loader
  //    doesn't currently surface a weather field, so this is always
  //    fallback for now — kept truthful)
  missing.push("weather");

  // 3. Parking — never invent. We don't have a real parking field yet.
  missing.push("parking");

  // 4. In the area — never invent a contact.
  missing.push("in_area");

  return [
    leaveBy
      ? {
          label: "LEAVE BY",
          value: leaveBy.value,
          sub: leaveBy.sub,
          icon: "clock",
        }
      : { ...INFO_STRIP_FALLBACK.leaveBy, missing: true },
    { ...INFO_STRIP_FALLBACK.weather, missing: true },
    { ...INFO_STRIP_FALLBACK.parking, missing: true },
    { ...INFO_STRIP_FALLBACK.inArea, missing: true },
  ];

  void loaded; // reserved for future weather/parking/contact wiring
}

function deriveLeaveBy(
  timeLabel?: string,
): { value: string; sub: string } | null {
  if (!timeLabel) return null;
  // Try to parse the first time fragment from a label like "7:42 PM" or "8:30 PM–11:00 PM"
  const match = timeLabel.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  const total = hour * 60 + min - 30; // leave 30 min before
  if (total < 0) return null;
  const lh = Math.floor(total / 60);
  const lm = total % 60;
  const display = formatClockTime(lh, lm);
  return { value: display, sub: "30 min before" };
}

function formatClockTime(hour24: number, minute: number): string {
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  let h = hour24 % 12;
  if (h === 0) h = 12;
  const m = minute.toString().padStart(2, "0");
  return `${h}:${m} ${meridiem}`;
}

// ── Chapters ────────────────────────────────────────────────────────────────

function buildChapters(input: {
  slug: string;
  loaded: LoadedPlan;
  sectionsByType: Map<string, LoadedPlanSection[]>;
}): PlanChapter[] {
  const { slug, loaded, sectionsByType } = input;
  const shape = loaded.shape ?? "experience";

  const make = (
    key: PlanChapterKey,
    title: string,
    description: string,
    icon: PlanChapter["icon"],
    sectionTypes: string[],
  ): PlanChapter => {
    const hasRealSection = sectionTypes.some((t) =>
      hasContent(sectionsByType.get(t)),
    );
    // Every section must earn its place: when no real content exists we leave
    // confirmation undefined and flag hasContent=false so the caller can hide
    // optional chapters rather than show copy-bank filler.
    const confirmation = hasRealSection
      ? confirmationFromSections(sectionTypes, sectionsByType)
      : undefined;
    return {
      key,
      title,
      description,
      href: `/plan/${slug}/${key}`,
      icon,
      confirmation,
      hasContent: hasRealSection,
    };
  };

  if (shape === "occasion") {
    return [
      make("before", "THE MOMENT", "Who, the occasion, and what it calls for.", "jacket", ["why", "notes"]),
      make("details", "YOUR MOVE", "Gift, contribution, or presence — sourced and ready.", "map-pin", ["cost", "detours", "alternatives"]),
      make("after", "IF ATTENDING", "What to wear, timing, and how to get there.", "moon", ["before", "wear", "timing"]),
    ].filter(hasContentOrAlwaysShow);
  }

  if (shape === "acquisition") {
    return [
      make("before", "WHAT TO GET", "Sourced options, ranked by fit.", "jacket", ["before", "alternatives", "detours"]),
      make("details", "WHERE", "Where to get it, with links and lead times.", "map-pin", ["notes", "details"]),
      make("after", "THE NUMBER", "What it costs, all in.", "moon", ["cost"]),
    ].filter(hasContentOrAlwaysShow);
  }

  if (shape === "touchpoint") {
    // Minimal, signal-card style.
    return [
      make("before", "WHO", "Context and relationship.", "jacket", ["why", "notes"]),
      make("details", "THE MOVE", "What to do, and how.", "map-pin", ["move", "details"]),
    ].filter(hasContentOrAlwaysShow);
  }

  // experience (default) — the six reference sections, always shown. Each
  // sub-page renders cleanly via copy-bank fallback when a section is thin,
  // so the plan reads complete like the reference.
  return [
    make("before", "BEFORE YOU GO", "What to wear, bring, and know before you leave.", "jacket", ["before", "wear", "bring", "cost"]),
    make("move", "THE MOVE", "The flow of the night, step by step.", "wine", ["move", "route", "timing"]),
    make("atmosphere", "ATMOSPHERE", "Energy, music, lighting, and the mood.", "record", ["atmosphere"]),
    make("details", "THE DETAILS", "Address, reservation, contacts, and intel.", "map-pin", ["notes", "details", "route"]),
    make("detours", "OPTIONAL DETOURS", "Places worth considering along the way.", "signpost", ["detours", "alternatives"]),
    make("after", "AFTER", "How the night can end well.", "moon", ["after"]),
  ];
}

/**
 * Always show the primary structural chapters (before / details) even while
 * content is still building. Hide optional ones (move / around-it / after)
 * when they have no real content.
 */
function hasContentOrAlwaysShow(chapter: PlanChapter): boolean {
  if (chapter.key === "before" || chapter.key === "details") return true;
  return chapter.hasContent;
}

function confirmationFromSections(
  types: string[],
  byType: Map<string, LoadedPlanSection[]>,
): string {
  for (const t of types) {
    const list = byType.get(t);
    if (!list || list.length === 0) continue;
    const first = list[0];
    const text = oneLineFrom(first.body || first.title);
    if (text) return text;
  }
  return chapterConfirmationFallback("before");
}

function oneLineFrom(body: string): string | undefined {
  const cleaned = cleanText(body);
  if (!cleaned) return undefined;
  // Take the first sentence, cap at 110 chars.
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  if (sentence.length > 110) return sentence.slice(0, 107).trimEnd() + "…";
  return sentence;
}

// ── Before section ──────────────────────────────────────────────────────────

function buildBefore(input: {
  loaded: LoadedPlan;
  category: PlanCategory;
  sectionsByType: Map<string, LoadedPlanSection[]>;
}) {
  const { loaded, category, sectionsByType } = input;
  const bank = beforeBank(category);

  const wearSections = sectionsByType.get("wear") ?? [];
  const wear = readLines(wearSections);
  const bringSections = sectionsByType.get("bring") ?? [];
  const bringFromSections = readLines(bringSections);
  const beforeSections = sectionsByType.get("before") ?? [];
  const knowFromBefore = readLines(beforeSections);

  const bring = bringFromSections.length > 0
    ? bringFromSections
    : loaded.grabList.length > 0
      ? loaded.grabList.map((g) => g.label)
      : bank.bring;

  const know = knowFromBefore.length > 0
    ? knowFromBefore
    : loaded.cautions.length > 0
      ? loaded.cautions
      : bank.know;

  return {
    wear: wear.length > 0 ? wear : bank.wear,
    bring,
    know,
    closing: bank.closing,
  };
}

function readLines(sections: LoadedPlanSection[]): string[] {
  const out: string[] = [];
  for (const s of sections) {
    if (s.bullets.length > 0) {
      out.push(...s.bullets.map((b) => cleanText(b) ?? "").filter(Boolean));
      continue;
    }
    const body = cleanText(s.body);
    if (!body) continue;
    // Split body on sentence boundaries; cap at 4 lines per section.
    const parts = body
      .split(/(?<=[.!?])\s+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 4);
    out.push(...parts);
  }
  // Cap to 6 total lines max so the page stays editorial, not dense.
  return out.slice(0, 6);
}

// ── Move section ────────────────────────────────────────────────────────────

function buildMove(input: {
  loaded: LoadedPlan;
  category: PlanCategory;
}) {
  const { loaded, category } = input;
  const items = loaded.timeline.length > 0
    ? loaded.timeline.map(timelineItemToMoveItem)
    : (FALLBACK_MOVE_ITEMS as readonly PlanMoveItem[]).slice();

  return {
    title: undefined,
    subtitle: undefined,
    items,
    closing: chapterCopy("move").closing,
  };
  void category;
}

function timelineItemToMoveItem(t: LoadedPlanTimelineItem): PlanMoveItem {
  return {
    time: cleanText(t.time) || undefined,
    title: cleanText(t.title) ?? "Moment",
    body: cleanText(t.details) ?? "Hold the pace.",
  };
}

// ── Light sections (atmosphere / details / detours / after) ────────────────

function buildLightSection(input: {
  key: PlanChapterKey;
  loaded: LoadedPlan;
  sectionsByType: Map<string, LoadedPlanSection[]>;
}): PlanLightSection {
  const { key, sectionsByType } = input;
  const copy = chapterCopy(key);
  const sectionTypes = sectionTypesForChapter(key);

  for (const t of sectionTypes) {
    const list = sectionsByType.get(t);
    if (!list || list.length === 0) continue;
    const first = list[0];
    const body = cleanText(first.body);
    if (body && body.length > 8) {
      return {
        body,
        bullets: first.bullets.filter(Boolean),
        confirmation: chapterConfirmationFallback(key),
        closing: copy.closing,
      };
    }
  }

  return {
    body: copy.fallbackBody,
    bullets: undefined,
    confirmation: chapterConfirmationFallback(key),
    closing: copy.closing,
    fallback: true,
  };
  void input.loaded;
}

function sectionTypesForChapter(key: PlanChapterKey): string[] {
  switch (key) {
    case "before":
      return ["before", "wear", "bring"];
    case "move":
      return ["move", "route", "timing"];
    case "atmosphere":
      return ["atmosphere"];
    case "details":
      return ["details", "notes", "route"];
    case "detours":
      return ["detours", "alternatives"];
    case "after":
      return ["after"];
    case "around-it":
      return ["detours", "alternatives", "after"];
  }
}

// ── Quote ───────────────────────────────────────────────────────────────────

function pickQuote(loaded: LoadedPlan, category: PlanCategory): string {
  const first = cleanText(loaded.cautions[0]);
  if (first && first.length > 16 && first.length < 200) return first;
  return quoteFor(category);
}

// ── Utilities ───────────────────────────────────────────────────────────────

function cleanText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/**
 * Detect rough "mechanical" strings — short field-form text we don't want
 * to surface as a hero summary. Lets the bank kick in for those.
 */
function isMechanical(s: string): boolean {
  const lower = s.toLowerCase();
  if (lower.length < 14) return true;
  if (/^[a-z]+\s+(restaurant|cafe|bar|store|shop)\b/i.test(lower)) return true;
  if (/^[A-Z]{2,}\s+\w+/.test(s) && s === s.toUpperCase()) return true;
  return false;
}

function hasContent(list?: LoadedPlanSection[]): boolean {
  if (!list || list.length === 0) return false;
  return list.some((s) => cleanText(s.body) || s.bullets.length > 0);
}

function indexSections(
  sections: LoadedPlanSection[],
): Map<string, LoadedPlanSection[]> {
  const map = new Map<string, LoadedPlanSection[]>();
  for (const s of sections) {
    const key = (s.sectionType ?? "").toLowerCase().trim();
    if (!key) continue;
    const prev = map.get(key);
    if (prev) prev.push(s);
    else map.set(key, [s]);
  }
  return map;
}
