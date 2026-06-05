/**
 * The Radar composite score (Prompt 2, Task 3a).
 *
 * Six taste dimensions blended into one real number in [0,1] with explicit,
 * legible weights. Taste fit is dominant by design. The blend is deterministic;
 * the dimension *inputs* are produced upstream — deterministic code in
 * lib/scoring/ does the hard filters and geometry, Claude-judged signals supply
 * the taste read. This module never does filtering, only weighting.
 *
 *   taste      — alignment with founder profile / taste signals, minus avoid.
 *   timeliness — relevant now / within a sensible window; events by date proximity.
 *   energy     — matches Jerry's energy ("elevated but relaxed").
 *   flow       — fits geography & patterns; proximity to *live location*.
 *   money      — fits budget posture ("worth it", not "cheap").
 *   benefit    — advances a North pillar (Body/Skill/Creative/Ownership/Taste/…).
 */
export type RadarCompositeDimensions = {
  taste: number;
  timeliness: number;
  energy: number;
  flow: number;
  money: number;
  benefit: number;
};

/** Explicit weights. Sum = 1.0. Taste dominates. */
export const RADAR_COMPOSITE_WEIGHTS: RadarCompositeDimensions = {
  taste: 0.4,
  timeliness: 0.15,
  benefit: 0.13,
  flow: 0.12,
  energy: 0.1,
  money: 0.1,
};

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Pure weighted blend of the six dimensions → composite in [0,1]. */
export function blendRadarComposite(dims: RadarCompositeDimensions): number {
  const w = RADAR_COMPOSITE_WEIGHTS;
  const total =
    clamp01(dims.taste) * w.taste +
    clamp01(dims.timeliness) * w.timeliness +
    clamp01(dims.benefit) * w.benefit +
    clamp01(dims.flow) * w.flow +
    clamp01(dims.energy) * w.energy +
    clamp01(dims.money) * w.money;
  return clamp01(total);
}

export type CompositeDeriveInput = {
  /** Taste fit in [0,1] (e.g. RadarScore.tasteFit). */
  tasteFit: number;
  /** Timing fit in [0,1] (e.g. RadarScore.timingFit / urgency). */
  timingFit?: number;
  /** Effort cost in [0,1]; higher = more draining. Energy = 1 − cost. */
  energyCost?: number;
  /** Spend cost in [0,1]; higher = pricier. Money fit favors the middle (worth-it). */
  moneyCost?: number;
  /** North alignment score in [0,1] and any long-term-value boost in [0,1]. */
  northAlignment?: number;
  longTermValue?: number;
  /** Geography for the flow dimension (miles from the freshest known position). */
  milesFromUser?: number | null;
};

/**
 * Derives the six dimensions from an item's existing sub-scores + geography.
 * Reuses signals already produced by the scoring pipeline so this is additive
 * and does not re-tune or bypass the quality gate.
 */
export function deriveCompositeDimensions(input: CompositeDeriveInput): RadarCompositeDimensions {
  const energy = 1 - clamp01(input.energyCost ?? 0.4);
  // Money posture: "spends with intention, not driven by price." Reward worth-it
  // (mid spend) over both bargain-bin and reckless; penalize only the extremes.
  const spend = clamp01(input.moneyCost ?? 0.3);
  const money = clamp01(1 - Math.abs(spend - 0.45) * 1.1);
  const benefit = clamp01(Math.max(input.northAlignment ?? 0, (input.longTermValue ?? 0) * 0.85));
  return {
    taste: clamp01(input.tasteFit),
    timeliness: clamp01(input.timingFit ?? 0.5),
    energy,
    flow: flowFromMiles(input.milesFromUser),
    money,
    benefit,
  };
}

/** Proximity-to-live-location → flow in [0,1]. Closer is better; unknown = neutral. */
export function flowFromMiles(miles: number | null | undefined): number {
  if (miles == null || !Number.isFinite(miles)) return 0.5;
  if (miles <= 2) return 1;
  if (miles <= 6) return 0.85;
  if (miles <= 12) return 0.65;
  if (miles <= 25) return 0.45;
  if (miles <= 45) return 0.25;
  return 0.1;
}

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
