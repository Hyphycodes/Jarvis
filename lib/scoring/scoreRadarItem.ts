import type { NormalizedCandidate } from "@/lib/ai/types";
import { scoreCandidate } from "@/lib/scoring/scoreCandidate";
import type { ScoreBreakdown, ScoringContext } from "@/lib/scoring/types";

export function scoreRadarItem(
  candidate: NormalizedCandidate,
  context: ScoringContext = {},
): ScoreBreakdown {
  return scoreCandidate(candidate, context);
}
