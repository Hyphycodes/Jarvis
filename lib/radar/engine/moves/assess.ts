/**
 * Move brain assessments (per jarvis-moves-engine-brain-tree.md). Moves are about
 * FIT — the most important brain — plus Energy + Weather (Moves-specific). Pure +
 * unit-tested. Run on every candidate before the LLM council touches finalists.
 *
 * Truth: free/self-directed moves are valid with a concrete sequence; bookable
 * moves need a source/booking. No sequence = not a Move.
 */

import type {
  MoveTruthAssessment,
  MoveFitAssessment,
  MoveEnergyAssessment,
  MoveWeatherAssessment,
  MovePlanabilityAssessment,
  MoveSurface,
} from "@/lib/radar/engine/moves/config";

export type AssessableMove = {
  title?: string | null;
  sub_library?: string | null;
  move_kind?: string | null;
  activity_type?: string | null;
  sequence?: unknown;
  gear_needed?: unknown;
  booking_url?: string | null;
  source_url?: string | null;
  location_name?: string | null;
  duration_minutes?: number | null;
  price_hint?: string | null;
  vibe_keywords?: string[] | null;
};

export type MoveFitContext = {
  now?: Date;
  weatherBad?: boolean | null;
  operatingMode?: string | null;
  lowFrictionWeeknights?: boolean;
};

const BOOKABLE = new Set(["paid", "bookable"]);

export function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

function sequenceSteps(seq: unknown): number {
  return Array.isArray(seq) ? seq.length : 0;
}

function isOutdoor(m: AssessableMove): boolean {
  if (m.sub_library === "moves_outdoor") return true;
  const blob = [m.title, m.activity_type, ...(m.vibe_keywords ?? [])].filter(Boolean).join(" ").toLowerCase();
  return /\b(walk|lakefront|trail|park|outdoor|cigar walk|sunset|riverwalk)\b/.test(blob);
}

// ── Truth ────────────────────────────────────────────────────────────────────
export function assessMoveTruth(m: AssessableMove): MoveTruthAssessment {
  const steps = sequenceSteps(m.sequence);
  const bookable = BOOKABLE.has((m.move_kind ?? "").toLowerCase());
  const hasSource = isHttpUrl(m.booking_url) || isHttpUrl(m.source_url);

  const verified_facts: string[] = [];
  const inferred_context: string[] = [];
  const missing: string[] = [];
  if (steps > 0) verified_facts.push("sequence");
  else missing.push("sequence");
  if (m.location_name?.trim()) verified_facts.push("location");
  if (bookable) {
    if (hasSource) verified_facts.push("booking_source");
    else missing.push("booking_source");
  } else {
    inferred_context.push("self_directed_flow");
  }

  // Free/self-directed valid with a concrete sequence; bookable needs a source.
  const action_confidence = clamp01(
    (steps >= 2 ? 0.6 : steps === 1 ? 0.35 : 0) + (bookable ? (hasSource ? 0.3 : 0) : 0.3) + (m.location_name?.trim() ? 0.1 : 0),
  );

  return {
    action_confidence,
    source_quality: bookable ? (hasSource ? "strong" : "weak") : steps > 0 ? "partial" : "weak",
    verified_facts,
    inferred_context,
    missing_action_data: missing,
    needs_enrichment: steps === 0 || (bookable && !hasSource),
  };
}

// ── Energy ───────────────────────────────────────────────────────────────────
export function assessEnergy(m: AssessableMove): MoveEnergyAssessment {
  const sub = m.sub_library ?? "";
  switch (sub) {
    case "moves_training":
      return { energy_required: "high", energy_payoff: "discipline", recovery_risk: "medium", reason: "Training session." };
    case "moves_sports":
      return { energy_required: "medium", energy_payoff: "energizing", recovery_risk: "low", reason: "Active sport." };
    case "moves_recovery":
      return { energy_required: "low", energy_payoff: "restorative", recovery_risk: "low", reason: "Recovery / reset." };
    case "moves_outdoor":
      return { energy_required: "low", energy_payoff: "restorative", recovery_risk: "low", reason: "Low-pressure outdoor reset." };
    case "moves_creative":
      return { energy_required: "medium", energy_payoff: "creative", recovery_risk: "low", reason: "Creative output/input." };
    case "moves_social":
      return { energy_required: "medium", energy_payoff: "social", recovery_risk: "low", reason: "Social plan." };
    case "moves_skill":
      return { energy_required: "medium", energy_payoff: "discipline", recovery_risk: "low", reason: "Skill session." };
    default:
      return { energy_required: "low", energy_payoff: "unknown", recovery_risk: "low", reason: "Lifestyle move." };
  }
}

// ── Weather ──────────────────────────────────────────────────────────────────
export function assessWeather(m: AssessableMove, ctx: MoveFitContext = {}): MoveWeatherAssessment {
  if (!isOutdoor(m)) {
    return { weather_required: false, weather_fit: "unknown", weather_notes: [], alternative_if_bad: null };
  }
  if (ctx.weatherBad) {
    return { weather_required: true, weather_fit: "bad", weather_notes: ["Bad weather — pause or move indoors."], alternative_if_bad: "An indoor recovery or training move instead." };
  }
  return { weather_required: true, weather_fit: ctx.weatherBad === false ? "good" : "unknown", weather_notes: [], alternative_if_bad: null };
}

// ── Fit (the most important Moves brain) ─────────────────────────────────────
export function assessMoveFit(m: AssessableMove, ctx: MoveFitContext = {}): MoveFitAssessment {
  const reasons: string[] = [];
  const vetoes: string[] = [];
  const energy = assessEnergy(m);
  const weather = assessWeather(m, ctx);
  const outdoor = isOutdoor(m);

  if (outdoor && weather.weather_fit === "bad") {
    vetoes.push("bad_weather_outdoor");
    reasons.push("Outdoor move on a bad-weather day — hold.");
  }

  // Friction: high-energy on a low-friction weeknight is higher friction.
  let friction_level: MoveFitAssessment["friction_level"] = "low";
  if (ctx.lowFrictionWeeknights && energy.energy_required === "high" && isWeeknight(ctx.now)) {
    friction_level = "high";
    reasons.push("High-effort on a weeknight he wants low-friction.");
  } else if (energy.energy_required === "high") {
    friction_level = "medium";
  }

  // Energy fit vs operating mode.
  const mode = (ctx.operatingMode ?? "").toLowerCase();
  let energy_fit: MoveFitAssessment["energy_fit"] = "right";
  if (mode === "recovery" && energy.energy_required === "high") energy_fit = "too_much";
  else if (mode === "building" && energy.energy_payoff === "restorative") energy_fit = "too_low";

  // Budget.
  const price = parsePrice(m.price_hint);
  let budget_fit: MoveFitAssessment["budget_fit"] = m.price_hint ? "comfortable" : "unknown";
  if (price != null && price > 150) budget_fit = "stretch";
  else if (price != null && price > 40) budget_fit = "premium_but_ok";
  else if (price != null) budget_fit = "comfortable";

  // Timing: moves are flexible. Low-friction restorative → today-friendly.
  let timing_fit: MoveFitAssessment["timing_fit"] = "this_week";
  if (vetoes.length === 0) {
    if (energy.energy_required === "low" || mode === "recovery") timing_fit = "today";
    else timing_fit = "this_week";
  } else {
    timing_fit = "bad_timing";
  }

  let recommended_surface: MoveSurface;
  if (vetoes.length > 0) recommended_surface = "reserve"; // weather pause → reserve, not suppress
  else if (timing_fit === "today" && energy_fit !== "too_much") recommended_surface = "today";
  else recommended_surface = "radar";

  const timingScore = timing_fit === "today" ? 1 : timing_fit === "this_week" ? 0.75 : 0.3;
  const frictionScore = friction_level === "low" ? 1 : friction_level === "medium" ? 0.7 : 0.4;
  const energyScore = energy_fit === "right" ? 1 : energy_fit === "too_much" ? 0.4 : 0.6;
  const fit_score = vetoes.length > 0 ? 0.3 : clamp01(0.4 * timingScore + 0.3 * frictionScore + 0.3 * energyScore);

  return { fit_score, timing_fit, friction_level, energy_fit, budget_fit, recommended_surface, reasons, vetoes };
}

// ── Planability ──────────────────────────────────────────────────────────────
export function assessMovePlanability(m: AssessableMove): MovePlanabilityAssessment {
  const steps = sequenceSteps(m.sequence);
  const bookable = BOOKABLE.has((m.move_kind ?? "").toLowerCase());
  const gear = Array.isArray(m.gear_needed) ? (m.gear_needed.filter((g) => typeof g === "string") as string[]) : [];
  const missing: string[] = [];
  if (steps === 0) missing.push("sequence");
  if (bookable && !isHttpUrl(m.booking_url) && !isHttpUrl(m.source_url)) missing.push("booking");
  return {
    plan_ready: steps > 0 && (!bookable || isHttpUrl(m.booking_url) || isHttpUrl(m.source_url)),
    start_location: m.location_name ?? null,
    suggested_duration_minutes: m.duration_minutes ?? null,
    gear_needed: gear,
    booking_required: bookable,
    booking_url: isHttpUrl(m.booking_url) ? m.booking_url : null,
    missing_plan_data: missing,
    suggested_pairings: [],
  };
}

function isWeeknight(now?: Date): boolean {
  const d = now ?? new Date();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  return day >= 1 && day <= 4; // Mon–Thu
}
function parsePrice(hint: string | null | undefined): number | null {
  if (!hint) return null;
  const m = /\$\s?(\d+)/.exec(hint);
  return m ? Number(m[1]) : null;
}
function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
