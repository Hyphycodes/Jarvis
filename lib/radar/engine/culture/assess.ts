/**
 * Culture brain assessments (per jarvis-culture-engine-brain-tree.md) — the cheap,
 * deterministic layers run on every candidate before the LLM council touches only
 * finalists. Pure + unit-tested.
 *
 * Truth — does it exist with a credible institution/source?
 * Depth — does it have real cultural substance (the culture-specific layer)?
 * Fit   — timeless vs dated, timing/friction/social, no fake urgency for timeless.
 * Planability — best time/window, duration, pairings, what to notice.
 *
 * Note: timeless culture NEVER auto-expires; only dated/temporary items do.
 */

import type {
  CultureTruthAssessment,
  CultureFitAssessment,
  CultureDepthAssessment,
  CulturePlanabilityAssessment,
  CultureSurface,
} from "@/lib/radar/engine/culture/config";

export type AssessableCulture = {
  title?: string | null;
  description?: string | null;
  venue_name?: string | null;
  institution_name?: string | null;
  source_url?: string | null;
  discovered_via?: string | null;
  is_dated?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
  admission_price_min?: number | null;
  admission_price_max?: number | null;
  vibe_keywords?: string[] | null;
  verdict_strength?: number | null;
};

export type CultureFitContext = {
  now?: Date;
  premiumThreshold?: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const CULTURE_KEYWORDS = /\b(curator|curatorial|retrospective|exhibition|collection|repertory|director|symphony|opera|architect|modernist|heritage|archive|premiere|ensemble|conservatory|biennial|monograph|provenance)\b/i;
const SHALLOW_FLAGS = /\b(immersive|selfie|instagram|instagrammable|pop[- ]?up photo|experience room|interactive lights|tiktok)\b/i;

export function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

function sourceUrlOf(c: AssessableCulture): string | null {
  if (isHttpUrl(c.source_url)) return c.source_url;
  if (isHttpUrl(c.discovered_via)) return c.discovered_via;
  return null;
}

function hasRealDate(v: string | null | undefined): boolean {
  if (!v) return false;
  const t = new Date(v).getTime();
  return Number.isFinite(t);
}

/** Dated culture expires like events (end+24h else start+24h); timeless never expires. */
export function cultureExpiresAt(c: AssessableCulture): string | null {
  if (!c.is_dated) return null;
  const base = c.ends_at ?? c.starts_at;
  if (!base) return null;
  const t = new Date(base).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + DAY_MS).toISOString();
}

// ── Truth ────────────────────────────────────────────────────────────────────
export function assessCultureTruth(c: AssessableCulture): CultureTruthAssessment {
  const sourceUrl = sourceUrlOf(c);
  const institution = Boolean(c.institution_name?.trim() || c.venue_name?.trim());
  const isDated = Boolean(c.is_dated) && hasRealDate(c.starts_at);

  const source_quality: CultureTruthAssessment["source_quality"] = isHttpUrl(c.source_url)
    ? "official"
    : isHttpUrl(c.discovered_via)
      ? "partial"
      : "weak";

  const verified_facts: string[] = [];
  const unsupported_claims: string[] = [];
  if (institution) verified_facts.push("institution");
  else unsupported_claims.push("no_institution");
  if (sourceUrl) verified_facts.push("source_url");
  else unsupported_claims.push("no_source");
  if (isDated) verified_facts.push("date");

  return {
    exists_confidence: clamp01((institution ? 0.4 : 0) + (sourceUrl ? 0.35 : 0) + (c.title?.trim() ? 0.15 : 0) + (isDated ? 0.1 : 0)),
    source_quality,
    institution_confidence: institution ? 0.85 : 0.2,
    date_confidence: isDated ? 0.9 : undefined,
    verified_facts,
    unsupported_claims,
    needs_enrichment: !institution || !sourceUrl,
    is_dated: isDated,
  };
}

// ── Depth (the culture-specific layer) ───────────────────────────────────────
export function assessDepth(c: AssessableCulture): CultureDepthAssessment {
  const blob = [c.title, c.description, ...(c.vibe_keywords ?? [])].filter(Boolean).join(" ");
  const reasons: string[] = [];
  const shallow_flags: string[] = [];

  let score = 0.3;
  if (c.institution_name?.trim()) { score += 0.2; reasons.push("named institution"); }
  if ((c.description ?? "").trim().length > 120) { score += 0.15; reasons.push("substantive description"); }
  if (CULTURE_KEYWORDS.test(blob)) { score += 0.2; reasons.push("curatorial/cultural language"); }
  if (typeof c.verdict_strength === "number") score += clamp01(c.verdict_strength) * 0.15;
  if (SHALLOW_FLAGS.test(blob)) { score -= 0.35; shallow_flags.push("instagram/immersive bait"); }

  const depth_score = clamp01(score);
  const substance: CultureDepthAssessment["substance"] =
    depth_score >= 0.75 ? "deep" : depth_score >= 0.55 ? "solid" : depth_score >= 0.35 ? "light" : "shallow";
  return { depth_score, substance, reasons, shallow_flags };
}

// ── Fit ──────────────────────────────────────────────────────────────────────
export function assessCultureFit(c: AssessableCulture, ctx: CultureFitContext = {}): CultureFitAssessment {
  const now = ctx.now ?? new Date();
  const reasons: string[] = [];
  const vetoes: string[] = [];

  let timing_fit: CultureFitAssessment["timing_fit"];
  if (c.is_dated && hasRealDate(c.starts_at)) {
    const days = (new Date(c.starts_at as string).getTime() - now.getTime()) / DAY_MS;
    if (days < -1) {
      timing_fit = "bad_timing";
      vetoes.push("expired_dated");
    } else if (sameLocalDay(new Date(c.starts_at as string), now)) timing_fit = "today";
    else if (days <= 7) timing_fit = "this_week";
    else timing_fit = "later";
  } else {
    // Timeless — no fake urgency; it's an evergreen radar/reserve idea.
    timing_fit = "later";
    reasons.push("Timeless — surface as an evergreen cultural idea, no urgency.");
  }

  // Budget (admission) vs posture.
  const price = c.admission_price_max ?? c.admission_price_min ?? null;
  const threshold = ctx.premiumThreshold ?? 300;
  let friction_level: CultureFitAssessment["friction_level"] = "low";
  if (price != null && price > threshold) friction_level = "high";
  else if (price != null && price > 60) friction_level = "medium";

  let recommended_surface: CultureSurface;
  if (vetoes.length > 0) recommended_surface = "suppress";
  else if (timing_fit === "today") recommended_surface = "today";
  else if (timing_fit === "this_week") recommended_surface = "radar";
  else recommended_surface = "radar"; // timeless culture lives on Radar/Reserve, not suppressed

  const timingScore = timing_fit === "today" ? 1 : timing_fit === "this_week" ? 0.85 : timing_fit === "later" ? 0.6 : 0;
  const frictionScore = friction_level === "low" ? 1 : friction_level === "medium" ? 0.75 : 0.4;
  const fit_score = vetoes.length > 0 ? 0 : clamp01(0.6 * timingScore + 0.4 * frictionScore);

  return {
    fit_score,
    timing_fit,
    friction_level,
    social_fit: "unknown",
    recommended_surface,
    reasons,
    vetoes,
  };
}

// ── Planability ──────────────────────────────────────────────────────────────
export function assessCulturePlanability(c: AssessableCulture): CulturePlanabilityAssessment {
  const missing: string[] = [];
  const hasVenue = Boolean(c.institution_name?.trim() || c.venue_name?.trim());
  if (!hasVenue) missing.push("venue_or_institution");
  if (!sourceUrlOf(c)) missing.push("source");

  const best_time = c.is_dated && hasRealDate(c.starts_at) ? c.starts_at ?? null : "Weekend afternoon or a quiet weekday";
  return {
    plan_ready: hasVenue,
    best_time,
    suggested_duration: "1–2 hours",
    pairings: hasVenue ? ["Coffee or a meal nearby", "A walk in the neighborhood"] : [],
    what_to_notice: [],
    missing_plan_data: missing,
  };
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
