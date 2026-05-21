import type { NormalizedCandidate } from "@/lib/ai/types";
import { scoreCandidate } from "@/lib/scoring/scoreCandidate";
import type { ScoreBreakdown, ScoringContext } from "@/lib/scoring/types";

export function scorePlan(
  candidate: NormalizedCandidate,
  context: ScoringContext = {},
): ScoreBreakdown {
  const base = scoreCandidate(candidate, context);
  const total = Math.round((base.total * 0.8 + base.logistics * 0.2) * 100) / 100;
  return { ...base, total };
}
