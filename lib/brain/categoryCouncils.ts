import "server-only";
import { hasRealEventTime } from "@/lib/radar/engine/events/config";

import type { IndexedItem } from "@/lib/index/types";
import type { BrainContextPacket } from "@/lib/brain/types";
import { normalizeRadarClassification, normalizeRadarCategory, type RadarCategory } from "@/lib/radar/category";
import { readBriefingFromPayload } from "@/lib/brain/briefingTypes";
import { assessFindBudget, findIsReady, type BudgetTier, type ProductDossier } from "@/lib/brain/productResearcher";

/**
 * Phase 2 category councils — deterministic, lane-specialized judgment that
 * augments the generic 5-voice decisionCouncil. Each category is judged on the
 * dimensions that actually matter for it (a sweater is not judged like a
 * restaurant). No LLM here: we read fields the pipeline already produced
 * (verdict_strength, briefing, location, timing, weather, tags) and turn them
 * into a lane score + human-readable signals/flags. The cross-category compare
 * happens later in the Executive Council.
 */

// ── Hold reasons (fixed enum for debuggable guardrails) ──────────────────────

export type HoldReason =
  | "missing_date"
  | "missing_location"
  | "missing_source"
  | "missing_sequence"
  | "missing_product_url"
  | "unrealistic_budget"
  | "low_confidence"
  | "wrong_template_risk";

export type CategoryDataReadiness = { ready: boolean; holdReasons: HoldReason[] };

export type CategoryCouncilResult = {
  category: RadarCategory;
  /** 0..1 lane-specialized composite, ready to blend into decisionCouncil. */
  score: number;
  /** Positive lane notes, e.g. "occasion-fit", "drift-fit", "weather-fit". */
  signals: string[];
  /** Lane-specific concerns, e.g. "generic", "no-date", "vague-sequence". */
  flags: string[];
  /** A subtle source label for the card, e.g. "Dining · Occasion-fit". */
  sourceLabel?: string;
};

// ── Shared field readers ─────────────────────────────────────────────────────

function payloadRecord(item: IndexedItem): Record<string, unknown> {
  return typeof item.rawPayload === "object" && item.rawPayload !== null && !Array.isArray(item.rawPayload)
    ? (item.rawPayload as Record<string, unknown>)
    : {};
}

function verdictStrength(item: IndexedItem): number | null {
  const p = payloadRecord(item);
  const v = p.verdict_strength ?? p.quality_score;
  return typeof v === "number" ? clamp01(v) : null;
}

function hasLocation(item: IndexedItem): boolean {
  return Boolean(item.address || (typeof item.lat === "number" && typeof item.lng === "number") || item.locationName);
}

function hasSource(item: IndexedItem): boolean {
  const p = payloadRecord(item);
  return Boolean(item.url || p.source_url || p.ticket_url || p.url || (Array.isArray(p.sources_cited) && p.sources_cited.length));
}

function hasReason(item: IndexedItem): boolean {
  const briefing = readBriefingFromPayload(item.rawPayload);
  return Boolean(
    (item.reasons && item.reasons.length > 0) ||
      briefing?.why_it_matters ||
      briefing?.why_now ||
      (item.description && item.description.trim().length > 24),
  );
}

function textBlob(item: IndexedItem): string {
  return [item.title, item.subtitle, item.description, ...(item.tags ?? []), ...(item.reasons ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const GENERIC_RE = /\b(yelp|tripadvisor|chain|franchise|tourist|generic|top 10|best of|near me|influencer|instagrammable|viral|hype)\b/i;
const SEQUENCE_RE = /\b(then|after|start|finish|route|loop|stop|walk to|drive to|grab|followed by|end at|first|next)\b/i;
const SHALLOW_CULTURE_RE = /\b(photo[- ]?op|selfie|content spot|backdrop|instagram)\b/i;
const OUTDOOR_RE = /\b(walk|park|patio|rooftop|outdoor|trail|garden|waterfront|riverwalk|beach|run|bike|golf|court)\b/i;

function baseConfidence(item: IndexedItem): number {
  const briefing = readBriefingFromPayload(item.rawPayload);
  return clamp01(verdictStrength(item) ?? briefing?.confidence ?? item.score ?? 0.55);
}

function weatherFavorsOutdoor(ctx?: BrainContextPacket): boolean | null {
  const w = ctx?.weather;
  if (!w) return null;
  // Rough: comfortable + not stormy. weatherCode <3 ~ clear/partly cloudy in Open-Meteo.
  const mild = w.temperatureF >= 50 && w.temperatureF <= 90 && w.windMph < 22;
  const clearish = typeof w.weatherCode === "number" ? w.weatherCode < 60 : true;
  return mild && clearish;
}

// ── Per-category rubrics (data-driven config) ────────────────────────────────

type SubJudgeResult = {
  name: string;
  delta: number;
  signal?: string;
  flag?: string;
  order?: number;
};

type SubJudge = (item: IndexedItem, ctx?: BrainContextPacket) => SubJudgeResult;

type RubricFn = (item: IndexedItem, ctx?: BrainContextPacket) => Omit<CategoryCouncilResult, "category" | "sourceLabel"> & { label?: string };

function named(name: string, delta: number, detail?: { signal?: string; flag?: string }): SubJudgeResult {
  return { name, delta, ...detail };
}

function runSubJudges(
  item: IndexedItem,
  judges: SubJudge[],
  ctx?: BrainContextPacket,
): Omit<CategoryCouncilResult, "category" | "sourceLabel"> & { label?: string } {
  const results = judges.map((judge, order) => ({ ...judge(item, ctx), order }));
  const signals = results
    .filter((result) => result.delta > 0 || result.signal)
    .map(formatJudgeSignal);
  const flags = results
    .filter((result) => result.delta < 0 || result.flag)
    .flatMap(formatJudgeFlag);
  const winner = results
    .filter((result) => result.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.order - b.order)[0];

  return {
    score: clamp01(baseConfidence(item) + results.reduce((sum, result) => sum + result.delta, 0)),
    signals,
    flags,
    label: winner ? labelForJudge(winner.name) : undefined,
  };
}

function formatJudgeSignal(result: SubJudgeResult): string {
  const score = result.delta >= 0 ? `+${result.delta.toFixed(2)}` : result.delta.toFixed(2);
  return result.signal ? `${result.name}:${score}:${result.signal}` : `${result.name}:${score}`;
}

function formatJudgeFlag(result: SubJudgeResult): string[] {
  const score = result.delta >= 0 ? `+${result.delta.toFixed(2)}` : result.delta.toFixed(2);
  const namedFlag = result.flag ? `${result.name}:${score}:${result.flag}` : `${result.name}:${score}`;
  return result.flag ? [namedFlag, result.flag] : [namedFlag];
}

function labelForJudge(name: string): string {
  return name
    .split("/")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("/");
}

function hasPayloadValue(item: IndexedItem, keys: string[]): boolean {
  const p = payloadRecord(item);
  return keys.some((key) => Boolean(p[key]));
}

function hasProductUrl(item: IndexedItem): boolean {
  const p = payloadRecord(item);
  return Boolean(item.url || p.product_url || p.retailer_url || p.purchase_url || p.url);
}

function hasPriceSignal(item: IndexedItem): boolean {
  const p = payloadRecord(item);
  return Boolean(p.price || p.priceEstimate || p.price_estimate || p.extracted_price || /[$]\d+/.test(textBlob(item)));
}

function hasImageSignal(item: IndexedItem): boolean {
  const p = payloadRecord(item);
  return Boolean(item.imageUrl || p.image_url || p.thumbnail_url || p.hero_image_url);
}

function hasOfficialStartTime(item: IndexedItem): boolean {
  // Local wall-clock midnight check (not UTC) — 7 PM Chicago = 00:00 UTC is real.
  return hasRealEventTime(item.startsAt);
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return (time - Date.now()) / 86_400_000;
}

const DINING_JUDGES: SubJudge[] = [
  (item) => named("food-credibility", hasSource(item) || verdictStrength(item) ? 0.04 : -0.04, hasSource(item) ? { signal: "credible-source" } : { flag: "weak_evidence" }),
  (item) => named("room/atmosphere", /room|atmosphere|intimate|booth|bar|patio|lounge|lighting|grown-up|date/i.test(textBlob(item)) ? 0.04 : 0),
  (item) => {
    const occasion = readBriefingFromPayload(item.rawPayload)?.occasion_type ?? "";
    return named("occasion-fit", /dinner|date|food|big_night|celebration/i.test(occasion) || /dinner|date night|celebration/i.test(textBlob(item)) ? 0.05 : 0);
  },
  (item) => named("reservation-reality", /reservation|resy|opentable|book|walk.?in|hours/i.test(textBlob(item)) || hasPayloadValue(item, ["reservation_url", "hours"]) ? 0.03 : 0),
  (item) => named("second-stop", hasPayloadValue(item, ["second_stop"]) || /cigar|dessert|nightcap|after/i.test(textBlob(item)) ? 0.03 : 0),
  (item) => named("logistics", hasLocation(item) ? 0.04 : -0.05, hasLocation(item) ? { signal: "located" } : { flag: "missing_location" }),
  (item) => named("anti-generic", GENERIC_RE.test(textBlob(item)) ? -0.18 : 0.02, GENERIC_RE.test(textBlob(item)) ? { flag: "generic" } : { signal: "specific" }),
];

const EVENT_JUDGES: SubJudge[] = [
  (item) => named("date/time confidence", hasOfficialStartTime(item) ? 0.07 : -0.3, hasOfficialStartTime(item) ? { signal: "official-time" } : { flag: "missing_date" }),
  (item) => named("ticket/source confidence", hasSource(item) ? 0.06 : -0.18, hasSource(item) ? { signal: "source-confirmed" } : { flag: "missing_source" }),
  (item) => named("venue fit", hasLocation(item) ? 0.04 : -0.08, hasLocation(item) ? { signal: "venue-known" } : { flag: "missing_location" }),
  (item) => named("cultural/social value", /jazz|dj|live|chef|wine|gallery|opening|comedy|speaker|festival|theatre|art/i.test(textBlob(item)) ? 0.04 : 0),
  (item) => {
    const days = daysUntil(item.startsAt);
    if (days == null) return named("urgency/expiry", -0.08, { flag: "missing_date" });
    if (days < 0) return named("urgency/expiry", -0.4, { flag: "expired_event" });
    if (days <= 10) return named("urgency/expiry", 0.06, { signal: "time-sensitive" });
    return named("urgency/expiry", 0);
  },
  (item) => named("companion fit", /friend|date|group|circle|with|bring|social/i.test(textBlob(item)) ? 0.03 : 0),
];

const CULTURE_JUDGES: SubJudge[] = [
  (item) => named("depth", /art|architecture|museum|gallery|exhibit|jazz|classical|film|design|heritage|craft|opera|lecture|author|screening/i.test(textBlob(item)) ? 0.06 : 0),
  (item) => named("taste-stretch", /new|rare|one-night|experimental|independent|craft|avant|retrospective|underground/i.test(textBlob(item)) ? 0.04 : 0),
  (item) => named("relevance-to-current-interests", /design|architecture|music|craft|heritage|style|food|ownership|fitness/i.test(textBlob(item)) ? 0.04 : 0),
  (item) => named("venue/timing fit", hasLocation(item) || item.startsAt ? 0.03 : -0.04, hasLocation(item) || item.startsAt ? undefined : { flag: "weak_evidence" }),
  (item) => named("anti-bait", SHALLOW_CULTURE_RE.test(textBlob(item)) ? -0.2 : 0.02, SHALLOW_CULTURE_RE.test(textBlob(item)) ? { flag: "shallow" } : { signal: "not-content-bait" }),
];

const PLACES_JUDGES: SubJudge[] = [
  (item) => named("place quality", verdictStrength(item) != null || hasReason(item) ? 0.05 : -0.04, hasReason(item) ? { signal: "reasoned" } : { flag: "low_confidence" }),
  (item) => named("neighborhood fit", Boolean(item.locationName || item.address) ? 0.04 : 0),
  (item) => named("drift-pattern fit", /walk|drift|neighborhood|nearby|route|stop|wander|loop/i.test(textBlob(item)) ? 0.04 : 0),
  (item, ctx) => {
    if (!OUTDOOR_RE.test(textBlob(item))) return named("weather/time fit", 0);
    const fav = weatherFavorsOutdoor(ctx);
    if (fav === true) return named("weather/time fit", 0.05, { signal: "weather-fit" });
    if (fav === false) return named("weather/time fit", -0.08, { flag: "weather-off" });
    return named("weather/time fit", 0);
  },
  (item) => named("photo/location confidence", hasImageSignal(item) || typeof item.lat === "number" || typeof item.lng === "number" ? 0.04 : -0.03),
  (item) => named("nearby-stop", /coffee|cigar|dessert|bookstore|bar|lunch|after|nearby/i.test(textBlob(item)) ? 0.03 : 0),
];

const MOVE_JUDGES: SubJudge[] = [
  (item) => named("energy fit", /low.?pressure|easy|walk|lift|run|bike|reset|active|quick|after work|morning/i.test(textBlob(item)) ? 0.04 : 0),
  (item, ctx) => {
    if (!OUTDOOR_RE.test(textBlob(item))) return named("weather/time fit", 0.02);
    const fav = weatherFavorsOutdoor(ctx);
    if (fav === true) return named("weather/time fit", 0.05, { signal: "weather-fit" });
    if (fav === false) return named("weather/time fit", -0.08, { flag: "weather-off" });
    return named("weather/time fit", 0);
  },
  (item) => named("social-context", /solo|friend|date|group|family|circle|bring|with/i.test(textBlob(item)) ? 0.03 : 0),
  (item) => named("execution-friction", /reservation required|sold out|far|hard to book|waitlist|complicated/i.test(textBlob(item)) ? -0.08 : 0.03),
  (item) => {
    const p = payloadRecord(item);
    const hasSequence = Boolean(p.sequence || p.steps || p.route) || SEQUENCE_RE.test(textBlob(item));
    return named("sequence quality", hasSequence ? 0.05 : -0.1, hasSequence ? { signal: "sequence" } : { flag: "vague-sequence" });
  },
  (item) => named("payoff", hasReason(item) || /payoff|worth it|reset|better|memory|skill|progress|good story/i.test(textBlob(item)) ? 0.04 : 0),
];

const FINDS_JUDGES: SubJudge[] = [
  (item) => named("need strength", /replace|upgrade|need|missing|worn|daily|hosting|travel|fitness|wardrobe/i.test(textBlob(item)) ? 0.05 : 0),
  (item) => named("product quality", hasPayloadValue(item, ["brand", "maker", "rating", "reviews"]) || verdictStrength(item) ? 0.05 : -0.03),
  (item) => named("price/value", hasPriceSignal(item) ? 0.04 : -0.03),
  (item) => named("specs/materials", /wool|cotton|leather|steel|linen|dimensions|material|spec|fit|size/i.test(textBlob(item)) || hasPayloadValue(item, ["materials", "specs"]) ? 0.04 : 0),
  (item) => named("taste fit", /classic|tailored|quiet|minimal|premium|refined|heritage|texture|matte/i.test(textBlob(item)) ? 0.04 : 0),
  (item) => named("buyability", hasProductUrl(item) ? 0.06 : -0.18, hasProductUrl(item) ? { signal: "buyable" } : { flag: "missing_product_url" }),
  (item) => {
    const dossier = readFindsDossier(item);
    const ready = dossier ? findIsReady(dossier) : false;
    return named("direct-product-data quality", ready ? 0.05 : -0.18, ready ? { signal: "product-ready" } : { flag: "needs-enrichment" });
  },
];

const RUBRICS: Record<RadarCategory, RubricFn> = {
  dining: (item, ctx) => runSubJudges(item, DINING_JUDGES, ctx),
  events: (item, ctx) => runSubJudges(item, EVENT_JUDGES, ctx),
  culture: (item, ctx) => runSubJudges(item, CULTURE_JUDGES, ctx),
  places: (item, ctx) => runSubJudges(item, PLACES_JUDGES, ctx),
  moves: (item, ctx) => runSubJudges(item, MOVE_JUDGES, ctx),
  finds: (item, ctx) => runSubJudges(item, FINDS_JUDGES, ctx),
};

const LABEL_PREFIX: Record<RadarCategory, string> = {
  dining: "Dining",
  events: "Events",
  culture: "Culture",
  places: "Places",
  moves: "Moves",
  finds: "Finds",
};

/** Lane-specialized score + signals/flags. Deterministic. */
export function scoreCategoryCouncil(
  item: IndexedItem,
  category: RadarCategory,
  ctx?: BrainContextPacket,
): CategoryCouncilResult {
  const rubric = RUBRICS[category];
  const { score, signals, flags, label } = rubric(item, ctx);
  return {
    category,
    score,
    signals,
    flags,
    sourceLabel: label ? `${LABEL_PREFIX[category]} · ${label}` : undefined,
  };
}

// ── Minimum-useful-data gate (block stubs, not partial enrichment) ───────────

/**
 * "Minimum useful data, not perfect data." Blocks true stubs from promotion
 * while letting useful partially-enriched items surface (e.g. a Place with a
 * real address + reason but no image still surfaces). Returns the specific
 * hold reasons so holds are debuggable.
 */
export function categoryDataReady(item: IndexedItem, categoryInput?: string | null): CategoryDataReadiness {
  const category =
    normalizeRadarClassification({
      category: categoryInput ?? item.category,
      type: item.type,
      title: item.title,
      subtitle: item.subtitle,
      description: item.description,
      locationName: item.locationName,
      startsAt: item.startsAt,
      tags: item.tags,
      reasons: item.reasons,
      sourcePayload: item.rawPayload,
    }).category ?? normalizeRadarCategory(item.category);
  const holdReasons: HoldReason[] = [];

  if (!category) {
    // Unknown lane — let it through but flag template risk for inspection.
    return { ready: true, holdReasons: [] };
  }

  switch (category) {
    case "events": {
      if (!hasOfficialStartTime(item)) holdReasons.push("missing_date");
      if (!hasLocation(item)) holdReasons.push("missing_location");
      if (!hasSource(item)) holdReasons.push("missing_source");
      break;
    }
    case "dining": {
      if (!hasLocation(item) && !hasSource(item)) holdReasons.push("missing_location");
      if (!hasReason(item)) holdReasons.push("low_confidence");
      break;
    }
    case "places": {
      // Address/coords OR credible source + a reason. Image NOT required.
      if (!hasLocation(item) && !hasSource(item)) holdReasons.push("missing_location");
      if (!hasReason(item)) holdReasons.push("low_confidence");
      break;
    }
    case "culture": {
      if (!hasSource(item) && !item.locationName) holdReasons.push("missing_source");
      if (!hasReason(item)) holdReasons.push("low_confidence");
      break;
    }
    case "moves": {
      const p = payloadRecord(item);
      const hasSequence = Boolean(p.sequence || p.steps || p.route) || SEQUENCE_RE.test(textBlob(item));
      const hasMoveContext = Boolean(
        p.move_kind ||
          p.best_time ||
          p.gear_needed ||
          p.price_hint ||
          item.locationName ||
          hasSource(item) ||
          hasReason(item),
      );
      if (!hasSequence && !hasMoveContext) holdReasons.push("missing_sequence");
      break;
    }
    case "finds": {
      const dossier = readFindsDossier(item);
      if (!dossier || !findIsReady(dossier)) holdReasons.push("missing_product_url");
      const userRequested = String(item.source) === "user_intent";
      if (!userRequested && dossier && readFindBudgetTier(dossier) === "hold") holdReasons.push("unrealistic_budget");
      break;
    }
  }

  // Wrong-template risk: category says one thing, type says another (e.g.
  // category=finds but type=place). Light check, never hard-blocks alone.
  if (category === "finds" && item.type === "place") holdReasons.push("wrong_template_risk");

  return { ready: holdReasons.length === 0, holdReasons };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function readFindsDossier(item: IndexedItem): ProductDossier | null {
  const p = payloadRecord(item);
  const finds = p.finds;
  return typeof finds === "object" && finds !== null && !Array.isArray(finds) ? (finds as ProductDossier) : null;
}

function readFindBudgetTier(dossier: ProductDossier): BudgetTier {
  const tier = dossier.budget_tier;
  if (tier === "attainable" || tier === "premium-realistic" || tier === "aspirational" || tier === "hold") return tier;
  return assessFindBudget(dossier).budget_tier;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, typeof n === "number" && Number.isFinite(n) ? n : 0));
}
