import "server-only";

import type { IndexedItem } from "@/lib/index/types";
import type { BrainContextPacket } from "@/lib/brain/types";
import { normalizeRadarCategory, type RadarCategory } from "@/lib/radar/category";
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

type RubricFn = (item: IndexedItem, ctx?: BrainContextPacket) => Omit<CategoryCouncilResult, "category" | "sourceLabel"> & { label?: string };

const RUBRICS: Record<RadarCategory, RubricFn> = {
  dining: (item) => {
    const briefing = readBriefingFromPayload(item.rawPayload);
    const signals: string[] = [];
    const flags: string[] = [];
    let s = baseConfidence(item);
    const occasion = briefing?.occasion_type ?? "";
    if (/dinner|date|food|big_night/.test(occasion)) { s += 0.05; signals.push("occasion-fit"); }
    if (hasLocation(item)) { s += 0.04; signals.push("located"); }
    const p = payloadRecord(item);
    if (p.second_stop || /cigar|dessert|nightcap|after/.test(textBlob(item))) { s += 0.03; signals.push("second-stop"); }
    if (GENERIC_RE.test(textBlob(item))) { s -= 0.18; flags.push("generic"); }
    return { score: clamp01(s), signals, flags, label: signals.includes("occasion-fit") ? "Occasion-fit" : undefined };
  },

  events: (item) => {
    const signals: string[] = [];
    const flags: string[] = [];
    let s = baseConfidence(item);
    if (item.startsAt) { s += 0.05; signals.push("dated"); } else { s -= 0.25; flags.push("no-date"); }
    if (hasSource(item)) { s += 0.05; signals.push("ticket-source"); } else { flags.push("no-source"); }
    // Urgency: events in the next ~10 days escalate; far-out or past de-escalate.
    if (item.startsAt) {
      const days = (new Date(item.startsAt).getTime() - Date.now()) / 86_400_000;
      if (days < 0) { s -= 0.4; flags.push("expired_event"); }
      else if (days <= 10) { s += 0.06; signals.push("urgent"); }
    }
    return { score: clamp01(s), signals, flags, label: signals.includes("urgent") ? "Time-sensitive" : undefined };
  },

  culture: (item) => {
    const signals: string[] = [];
    const flags: string[] = [];
    let s = baseConfidence(item);
    const blob = textBlob(item);
    if (/art|architecture|museum|gallery|exhibit|jazz|classical|film|design|heritage|craft|opera/.test(blob)) {
      s += 0.05; signals.push("depth");
    }
    if (SHALLOW_CULTURE_RE.test(blob)) { s -= 0.2; flags.push("shallow"); }
    if (hasSource(item)) signals.push("sourced");
    return { score: clamp01(s), signals, flags, label: signals.includes("depth") ? "Depth" : undefined };
  },

  places: (item, ctx) => {
    const signals: string[] = [];
    const flags: string[] = [];
    let s = baseConfidence(item);
    if (item.locationName || item.address) { s += 0.04; signals.push("located"); }
    if (typeof item.lat === "number" && typeof item.lng === "number") signals.push("mapped");
    const outdoor = OUTDOOR_RE.test(textBlob(item));
    if (outdoor) {
      const fav = weatherFavorsOutdoor(ctx);
      if (fav === true) { s += 0.05; signals.push("weather-fit"); }
      else if (fav === false) { s -= 0.08; flags.push("weather-off"); }
    }
    return { score: clamp01(s), signals, flags, label: signals.includes("weather-fit") ? "Weather-fit" : undefined };
  },

  moves: (item, ctx) => {
    const signals: string[] = [];
    const flags: string[] = [];
    let s = baseConfidence(item);
    const p = payloadRecord(item);
    const blob = textBlob(item);
    const hasSequence = Boolean(p.sequence || p.steps || p.route) || SEQUENCE_RE.test(blob);
    if (hasSequence) { s += 0.05; signals.push("sequence"); } else { s -= 0.1; flags.push("vague-sequence"); }
    if (OUTDOOR_RE.test(blob)) {
      const fav = weatherFavorsOutdoor(ctx);
      if (fav === true) { s += 0.05; signals.push("weather-fit"); }
      else if (fav === false) { s -= 0.08; flags.push("weather-off"); }
    }
    return { score: clamp01(s), signals, flags, label: signals.includes("weather-fit") ? "Weather-fit" : undefined };
  },

  finds: (item) => {
    // Style now feeds Finds; judged by the Finds readiness gate, not here.
    const dossier = readFindsDossier(item);
    const ready = dossier ? findIsReady(dossier) : false;
    return {
      score: ready ? clamp01(baseConfidence(item)) : 0.3,
      signals: ready ? ["product-ready"] : ["researching"],
      flags: ready ? [] : ["needs-enrichment"],
      label: undefined,
    };
  },
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
  const category = normalizeRadarCategory(categoryInput ?? item.category) ?? normalizeRadarCategory(item.category);
  const holdReasons: HoldReason[] = [];

  if (!category) {
    // Unknown lane — let it through but flag template risk for inspection.
    return { ready: true, holdReasons: [] };
  }

  switch (category) {
    case "events": {
      if (!item.startsAt) holdReasons.push("missing_date");
      if (!hasSource(item) && !hasLocation(item)) holdReasons.push("missing_source");
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
