import "server-only";

import type { IndexedItem } from "@/lib/index/types";
import type { PlanReadiness, RadarScore, SignalProfile, TruthRead } from "@/lib/intelligence/types";

export function evaluatePlanReadiness(input: {
  item: IndexedItem;
  signal: SignalProfile;
  truth: TruthRead;
  score: RadarScore;
}): PlanReadiness {
  const { item, signal, truth, score } = input;
  const confidence = clamp01(
    score.planPotential * 0.38 +
      score.evidenceQuality * 0.3 +
      score.tasteFit * 0.18 +
      score.timingFit * 0.14,
  );
  const shouldPreparePlan =
    score.total >= 0.8 &&
    confidence >= 0.72 &&
    truth.evidenceQuality >= 0.62 &&
    !truth.flags.includes("briefing_missing");
  const location = item.locationName ?? item.address;
  const timeWindow = item.startsAt ?? item.endsAt ?? item.briefing?.why_now;

  return {
    shouldPreparePlan,
    confidence,
    knownDetails: truth.knownDetails,
    missingDetails: truth.missingDetails,
    planSeed: shouldPreparePlan
      ? {
          title: signal.moveTitle,
          category: signal.category,
          location,
          timeWindow,
          summary: item.briefing?.one_line ?? item.description ?? signal.reasonSurfaced,
          reason: signal.strongestAngle,
          likelyChapters: likelyChaptersFor(signal.category, item.type),
          firstMove: firstMoveFor(signal, truth),
        }
      : undefined,
  };
}

function likelyChaptersFor(category: string, type: string): string[] {
  const text = `${category} ${type}`.toLowerCase();
  if (/product|style|idea|real estate/.test(text)) {
    return ["Why This Fits", "What to Verify", "Compare", "Next Step"];
  }
  if (/event|culture|music/.test(text)) {
    return ["Why This Fits", "Timing", "Before You Go", "The Move", "After"];
  }
  if (/outdoors|health|activity/.test(text)) {
    return ["Why This Fits", "Best Window", "Prep", "Effort", "After"];
  }
  return ["Why This Fits", "Before You Go", "The Move", "The Details", "After"];
}

function firstMoveFor(signal: SignalProfile, truth: TruthRead): string {
  if (truth.missingDetails.length > 0) {
    return `Confirm ${truth.missingDetails[0]} before committing.`;
  }
  if (signal.suggestedAction === "plan") return "Stage the plan.";
  return signal.strongestAngle;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

