import type { SourceGraphRow, SourceStatus } from "@/lib/library/sourceGraphTypes";

export type SourceQualityScore = {
  score: number;
  status: SourceStatus;
  cadenceHours: number;
  reason: string;
};

export function scoreSourceQuality(input: Partial<SourceGraphRow>): SourceQualityScore {
  const saveRate = input.save_rate ?? rate(input.total_saved, input.total_candidates);
  const passRate = input.pass_rate ?? rate(input.total_passed, input.total_candidates);
  const planRate = input.plan_rate ?? rate(input.total_planned, input.total_candidates);
  const conversion = Math.min(1, saveRate * 0.35 + planRate * 0.45 + rate(input.total_library_items, input.total_candidates) * 0.2);
  const penalty = Math.min(0.65, passRate * 0.45 + (input.duplicate_rate ?? 0) * 0.35);
  const score = clamp01(
    (input.trust_score ?? 0.5) * 0.28 +
    (input.taste_fit_score ?? 0.5) * 0.28 +
    (input.novelty_score ?? 0.5) * 0.14 +
    (input.freshness_score ?? 0.5) * 0.12 +
    conversion -
    penalty,
  );
  if (input.status === "muted" || input.status === "retired") {
    return { score, status: input.status, cadenceHours: 0, reason: "Source is manually muted or retired." };
  }
  if (score >= 0.72 || planRate >= 0.2) {
    return { score, status: "watching", cadenceHours: 12, reason: "Strong source: saves/plans or quality score crossed upgrade threshold." };
  }
  if (score >= 0.58) {
    return { score, status: "watching", cadenceHours: 36, reason: "Useful source: keep normal watch cadence." };
  }
  if (passRate >= 0.45 || (input.duplicate_rate ?? 0) >= 0.35 || score < 0.38) {
    return { score, status: "cooldown", cadenceHours: 168, reason: "Weak source: high pass/duplicate rate or low quality score." };
  }
  return { score, status: "testing", cadenceHours: 72, reason: "Testing source: not enough signal yet." };
}

export function scheduleNextSourceCheck(input: SourceQualityScore & { from?: string }): string | null {
  if (input.status === "muted" || input.status === "retired" || input.cadenceHours <= 0) return null;
  const from = input.from ? new Date(input.from) : new Date();
  return new Date(from.getTime() + input.cadenceHours * 60 * 60 * 1000).toISOString();
}

function rate(count: number | null | undefined, total: number | null | undefined): number {
  return total && total > 0 ? (count ?? 0) / total : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
