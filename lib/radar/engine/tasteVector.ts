/**
 * Taste as a VECTOR, not a number (per radar-curation-engine.md PART 4).
 *
 * Every candidate carries a 5-axis taste vector; each sub-library weights the
 * axes differently (its specialist brain). "Best" then means something specific
 * per lane instead of one flat score. Pure module — tsx-testable, no IO.
 *
 *   craft      — is the thing itself genuinely good (real identity vs trend/marketing)?
 *   fit        — is it Jerry? no scene, no pretense, no tourist, no corny, no generic.
 *   timing     — right for season/day/now?
 *   novelty    — has he seen this / does he own its equivalent?
 *   relational — does it connect to his people?
 */

export type TasteVector = {
  craft: number;
  fit: number;
  timing: number;
  novelty: number;
  relational: number;
};

export type TasteAxis = keyof TasteVector;
export const TASTE_AXES: readonly TasteAxis[] = ["craft", "fit", "timing", "novelty", "relational"];

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function emptyTasteVector(): TasteVector {
  return { craft: 0, fit: 0, timing: 0, novelty: 0, relational: 0 };
}

/** Per-sub-library axis weights. Dining leans craft + fit; bars tilt to fit/energy;
 *  cafes to craft + timing (slow-morning rooms). Sum need not be exactly 1 — the
 *  blend normalizes by the weight sum. */
export const SUBLIBRARY_WEIGHTS: Record<string, TasteVector> = {
  dining_restaurants: { craft: 0.34, fit: 0.30, timing: 0.12, novelty: 0.14, relational: 0.10 },
  dining_bars: { craft: 0.30, fit: 0.32, timing: 0.14, novelty: 0.14, relational: 0.10 },
  dining_cafes: { craft: 0.34, fit: 0.30, timing: 0.16, novelty: 0.12, relational: 0.08 },
};

export const DEFAULT_WEIGHTS: TasteVector = {
  craft: 0.3, fit: 0.3, timing: 0.15, novelty: 0.15, relational: 0.1,
};

export function weightsFor(subLibrary: string): TasteVector {
  return SUBLIBRARY_WEIGHTS[subLibrary] ?? DEFAULT_WEIGHTS;
}

/** Weighted, normalized blend of a taste vector → a single score in [0,1]. */
export function blendTasteVector(vector: TasteVector, weights: TasteVector): number {
  const numerator =
    clamp01(vector.craft) * weights.craft +
    clamp01(vector.fit) * weights.fit +
    clamp01(vector.timing) * weights.timing +
    clamp01(vector.novelty) * weights.novelty +
    clamp01(vector.relational) * weights.relational;
  const weightSum =
    weights.craft + weights.fit + weights.timing + weights.novelty + weights.relational;
  return clamp01(weightSum > 0 ? numerator / weightSum : 0);
}

/** Convenience: blend with the sub-library's own weights. */
export function preScore(vector: TasteVector, subLibrary: string): number {
  return blendTasteVector(vector, weightsFor(subLibrary));
}
