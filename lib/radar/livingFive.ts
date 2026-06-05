import { RADAR_CATEGORIES, type RadarCategory } from "@/lib/radar/category";

/**
 * The living-5 engine (Prompt 2, Task 3).
 *
 * Radar's job: each of the six categories always holds exactly its 5 strongest
 * current fits — never empty (if real fits exist), never stale, never padded
 * with junk. This module is the pure decision core: given the current board and
 * the eligible candidate pool (already past the quality gate), it computes which
 * candidates fill open slots and which displace a weaker sitting member.
 *
 * It does not score, filter, or write — callers supply composites and eligibility
 * (so the Decision Council gate stays the sole arbiter of quality), and apply the
 * returned plan to the DB.
 */
export const LIVING_FIVE_PER_CATEGORY = 5;

// A candidate must beat the weakest sitting member by at least this margin to
// displace it — hysteresis so the board doesn't churn on noise.
export const DISPLACEMENT_MARGIN = 0.04;

export type LivingFiveMember = {
  id: string;
  category: RadarCategory;
  composite: number;
  /** Only eligible items (past the gate) may occupy a slot. */
  eligible: boolean;
  /** Displacement also requires the challenger to be timely/valid. Default true. */
  timelyValid?: boolean;
};

export type LivingFivePlan = {
  /** Candidates that fill an open slot in an under-filled category. */
  promotions: Array<{ id: string; category: RadarCategory }>;
  /** Candidate replaces the weakest sitting member of a full category. */
  displacements: Array<{ promote: string; demote: string; category: RadarCategory }>;
  /** Categories still short of the target after this pass — Scout should prioritize these. */
  gaps: Array<{ category: RadarCategory; have: number; need: number }>;
  /** Per-category final occupancy after applying the plan (for logging). */
  occupancy: Record<RadarCategory, number>;
};

export function planLivingFive(input: {
  active: LivingFiveMember[];
  candidates: LivingFiveMember[];
  perCategory?: number;
  displacementMargin?: number;
  /** Optional cap on total board changes this run (promotions + displacements). */
  maxChanges?: number;
}): LivingFivePlan {
  const perCategory = input.perCategory ?? LIVING_FIVE_PER_CATEGORY;
  const margin = input.displacementMargin ?? DISPLACEMENT_MARGIN;
  const maxChanges = input.maxChanges ?? Infinity;

  const plan: LivingFivePlan = {
    promotions: [],
    displacements: [],
    gaps: [],
    occupancy: emptyOccupancy(),
  };
  let changes = 0;

  for (const category of RADAR_CATEGORIES) {
    // Sitting members, strongest first. Kept as a mutable working set.
    const sitting = input.active
      .filter((m) => m.category === category)
      .sort(byCompositeDesc);
    // Eligible challengers for this category, strongest first.
    const challengers = input.candidates
      .filter((m) => m.category === category && m.eligible)
      .sort(byCompositeDesc);

    let ci = 0;

    // 1) Fill open slots with the strongest eligible challengers.
    while (sitting.length < perCategory && ci < challengers.length && changes < maxChanges) {
      const next = challengers[ci++];
      plan.promotions.push({ id: next.id, category });
      sitting.push(next);
      sitting.sort(byCompositeDesc);
      changes++;
    }

    // 2) Displacement: a stronger, timely challenger bumps the weakest sitter.
    while (ci < challengers.length && sitting.length >= perCategory && changes < maxChanges) {
      const challenger = challengers[ci];
      const weakest = sitting[sitting.length - 1];
      const timely = challenger.timelyValid !== false;
      if (timely && challenger.composite > weakest.composite + margin) {
        plan.displacements.push({ promote: challenger.id, demote: weakest.id, category });
        sitting.pop(); // remove weakest
        sitting.push(challenger);
        sitting.sort(byCompositeDesc);
        changes++;
        ci++;
      } else {
        // Challengers are sorted desc — if the strongest remaining can't clear
        // the weakest+margin, none can. Stop.
        break;
      }
    }

    const have = Math.min(sitting.length, perCategory);
    plan.occupancy[category] = have;
    if (have < perCategory) {
      plan.gaps.push({ category, have, need: perCategory });
    }
  }

  return plan;
}

function byCompositeDesc(a: LivingFiveMember, b: LivingFiveMember): number {
  return b.composite - a.composite;
}

function emptyOccupancy(): Record<RadarCategory, number> {
  return RADAR_CATEGORIES.reduce((acc, c) => {
    acc[c] = 0;
    return acc;
  }, {} as Record<RadarCategory, number>);
}
