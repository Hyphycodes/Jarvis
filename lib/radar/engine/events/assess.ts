/**
 * Event brain assessments (per jarvis-events-engine-brain-tree.md) — the cheap,
 * deterministic layers that run on EVERY candidate before the LLM council touches
 * only finalists. Pure + unit-tested.
 *
 * Truth  — does the event really exist with real date/venue/source?
 * Urgency — how soon / how time-sensitive?
 * Fit    — does it fit the calendar/rhythm/spend/weather right now?
 * Planability — is it plan-ready, with arrival + before/after?
 */

import type {
  EventTruthAssessment,
  EventUrgencyAssessment,
  EventFitAssessment,
  EventPlanabilityAssessment,
  EventSurface,
} from "@/lib/radar/engine/events/config";

export type AssessableEvent = {
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  venue_name?: string | null;
  ticket_url?: string | null;
  discovered_via?: string | null;
  sources_cited?: unknown;
  named_entities?: string[] | null;
  verdict_strength?: number | null;
  price_min?: number | null;
  price_max?: number | null;
  sub_library?: string | null;
};

export type FitContext = {
  now?: Date;
  /** Owner declared rhythm/spend (from operating prefs). */
  lowFrictionWeeknights?: boolean;
  premiumThreshold?: number | null;
  /** For events_outdoor: is the weather bad on the event day? */
  weatherBadOnEventDay?: boolean | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// ── shared helpers ─────────────────────────────────────────────────────────────
export function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

export function firstSourceUrl(e: AssessableEvent): string | null {
  if (isHttpUrl(e.ticket_url)) return e.ticket_url;
  if (isHttpUrl(e.discovered_via)) return e.discovered_via;
  return firstUrlDeep(e.sources_cited);
}

function firstUrlDeep(value: unknown): string | null {
  if (isHttpUrl(value)) return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const f = firstUrlDeep(v);
      if (f) return f;
    }
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const f = firstUrlDeep(v);
      if (f) return f;
    }
  }
  return null;
}

/** A real instant — rejects midnight-only T00:00 "dates" that carry no real time. */
export function hasOfficialTime(v: string | null | undefined): boolean {
  if (!v) return false;
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return false;
  return !/T00:00(?::00(?:\.000)?)?(?:Z|[+-]\d\d:?\d\d)?$/i.test(v);
}

/** Expiration instant: end+24h, else start+24h. */
export function expiresAtFor(e: AssessableEvent): string | null {
  const base = e.ends_at ?? e.starts_at;
  if (!base) return null;
  const t = new Date(base).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + DAY_MS).toISOString();
}

// ── Truth ───────────────────────────────────────────────────────────────────────
export function assessTruth(e: AssessableEvent): EventTruthAssessment {
  const sourceUrl = firstSourceUrl(e);
  const hasTime = hasOfficialTime(e.starts_at);
  const hasDate = Boolean(e.starts_at) && Number.isFinite(new Date(e.starts_at as string).getTime());
  const hasVenue = Boolean(e.venue_name?.trim());
  const hasEntities = (e.named_entities ?? []).length > 0;

  const source_quality: EventTruthAssessment["source_quality"] = isHttpUrl(e.ticket_url)
    ? "official"
    : isHttpUrl(e.discovered_via) || firstUrlDeep(e.sources_cited)
      ? "partial"
      : "weak";

  const verified_facts: string[] = [];
  const unsupported_claims: string[] = [];
  if (hasTime) verified_facts.push("official_time");
  else if (hasDate) verified_facts.push("date_only");
  else unsupported_claims.push("no_real_date");
  if (hasVenue) verified_facts.push("venue");
  else unsupported_claims.push("no_venue");
  if (sourceUrl) verified_facts.push("source_url");
  else unsupported_claims.push("no_source");

  return {
    exists_confidence: clamp01((hasTime ? 0.45 : hasDate ? 0.25 : 0) + (hasVenue ? 0.25 : 0) + (sourceUrl ? 0.2 : 0) + (hasEntities ? 0.1 : 0)),
    datetime_confidence: hasTime ? 0.9 : hasDate ? 0.4 : 0,
    venue_confidence: hasVenue ? 0.85 : 0,
    source_quality,
    source_url: sourceUrl,
    ticket_url: isHttpUrl(e.ticket_url) ? e.ticket_url : null,
    verified_facts,
    unsupported_claims,
    needs_enrichment: !hasTime || !hasVenue || !sourceUrl,
  };
}

// ── Urgency ──────────────────────────────────────────────────────────────────────
export function assessUrgency(e: AssessableEvent, now: Date = new Date()): EventUrgencyAssessment {
  if (!e.starts_at) return { urgency: "low", reason: "No date." };
  const start = new Date(e.starts_at).getTime();
  if (!Number.isFinite(start)) return { urgency: "low", reason: "Unparseable date." };
  const expiry = expiresAtFor(e);
  if (expiry && new Date(expiry).getTime() < now.getTime()) {
    return { urgency: "expired", reason: "Past its expiration window." };
  }
  const days = (start - now.getTime()) / DAY_MS;
  if (days < 0) return { urgency: "now", action_deadline: e.starts_at, reason: "Happening now / today." };
  if (days <= 1.5) return { urgency: "now", action_deadline: e.starts_at, reason: "Within a day — act now." };
  if (days <= 4) return { urgency: "soon", action_deadline: e.starts_at, reason: "This weekend / within days." };
  if (days <= 14) return { urgency: "normal", reason: "Within two weeks." };
  return { urgency: "low", reason: "Far out — reserve unless exceptional." };
}

// ── Fit ──────────────────────────────────────────────────────────────────────────
export function assessFit(e: AssessableEvent, ctx: FitContext = {}): EventFitAssessment {
  const now = ctx.now ?? new Date();
  const reasons: string[] = [];
  const vetoes: string[] = [];

  // Timing
  let timing_fit: EventFitAssessment["timing_fit"] = "later";
  if (e.starts_at) {
    const start = new Date(e.starts_at);
    const days = (start.getTime() - now.getTime()) / DAY_MS;
    if (!Number.isFinite(start.getTime())) timing_fit = "bad_timing";
    else if (days < 0) timing_fit = "bad_timing";
    else if (sameLocalDay(start, now)) timing_fit = "today";
    else if (days <= 7) timing_fit = "this_week";
    else timing_fit = "later";
  } else {
    timing_fit = "bad_timing";
    vetoes.push("no_date");
  }

  // Outdoor weather veto
  if (e.sub_library === "events_outdoor" && ctx.weatherBadOnEventDay) {
    vetoes.push("bad_weather_outdoor");
    reasons.push("Outdoor event on a bad-weather day — hold/warn.");
  }

  // Friction — late weeknight when the owner wants low-friction weeknights.
  let friction_level: EventFitAssessment["friction_level"] = "unknown";
  if (e.starts_at && hasOfficialTime(e.starts_at)) {
    const d = new Date(e.starts_at);
    const weekend = [0, 5, 6].includes(d.getDay());
    const lateHour = d.getHours() >= 21;
    if (ctx.lowFrictionWeeknights && !weekend && lateHour) {
      friction_level = "high";
      reasons.push("Late on a weeknight — higher friction.");
    } else {
      friction_level = lateHour && !weekend ? "medium" : "low";
    }
  }

  // Budget vs declared posture.
  const price = e.price_max ?? e.price_min ?? null;
  const threshold = ctx.premiumThreshold ?? 300;
  let budget_fit: EventFitAssessment["budget_fit"] = "unknown";
  if (price == null) budget_fit = "unknown";
  else if (price <= 60) budget_fit = "comfortable";
  else if (price <= threshold) budget_fit = "premium_but_ok";
  else budget_fit = "stretch";

  // Surface recommendation.
  let recommended_surface: EventSurface;
  if (vetoes.length > 0) recommended_surface = "suppress";
  else if (timing_fit === "today") recommended_surface = "today";
  else if (timing_fit === "this_week") recommended_surface = "radar";
  else if (timing_fit === "later") recommended_surface = "reserve";
  else recommended_surface = "suppress";

  // Score: timing + friction + budget.
  const timingScore = timing_fit === "today" ? 1 : timing_fit === "this_week" ? 0.8 : timing_fit === "later" ? 0.45 : 0;
  const frictionScore = friction_level === "low" ? 1 : friction_level === "medium" ? 0.7 : friction_level === "high" ? 0.4 : 0.7;
  const budgetScore = budget_fit === "comfortable" ? 1 : budget_fit === "premium_but_ok" ? 0.8 : budget_fit === "stretch" ? 0.4 : 0.7;
  const fit_score = vetoes.length > 0 ? 0 : clamp01(0.5 * timingScore + 0.25 * frictionScore + 0.25 * budgetScore);

  return { fit_score, timing_fit, friction_level, budget_fit, recommended_surface, reasons, vetoes };
}

// ── Planability ──────────────────────────────────────────────────────────────────
export function assessPlanability(e: AssessableEvent): EventPlanabilityAssessment {
  const missing: string[] = [];
  const hasTime = hasOfficialTime(e.starts_at);
  const hasVenue = Boolean(e.venue_name?.trim());
  const source = firstSourceUrl(e);
  if (!hasTime) missing.push("official_time");
  if (!hasVenue) missing.push("venue");
  if (!source) missing.push("source_or_ticket");

  let suggested_arrival: string | null = null;
  if (hasTime) {
    const d = new Date(e.starts_at as string);
    suggested_arrival = new Date(d.getTime() - 20 * 60 * 1000).toISOString(); // 20 min early
  }

  const evening = hasTime && new Date(e.starts_at as string).getHours() >= 17;
  const before_options = evening ? ["Dinner before nearby", "Drink before at a quiet bar"] : [];
  const after_options = evening ? ["Nightcap or coffee after"] : [];

  return {
    plan_ready: hasTime && hasVenue && Boolean(source),
    suggested_arrival,
    before_options,
    after_options,
    logistics_notes: hasVenue ? [`Venue: ${e.venue_name}`] : [],
    missing_plan_data: missing,
  };
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
