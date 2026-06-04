import "server-only";

import { evaluateCandidateForRadar } from "@/lib/brain/decisionCouncil";
import type { IndexedItem } from "@/lib/index/types";
import type { JarvisContext, JarvisJudgment } from "@/lib/intelligence/types";

export function judgeSignal(
  item: IndexedItem,
  context?: JarvisContext,
): JarvisJudgment {
  const decision = evaluateCandidateForRadar(item, {
    brainContext: context,
    timeContext: context?.velocityTimeContext,
  });
  return {
    admission: decision.admission,
    confidence: decision.confidence,
    reason: decision.rejection_reason ?? decision.best_move,
    decision,
  };
}

