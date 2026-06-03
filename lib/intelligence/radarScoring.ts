import "server-only";

import { computeNorthAlignment } from "@/lib/context/types";
import type {
  JarvisContext,
  JarvisJudgment,
  RadarItem,
  RadarScore,
  SignalProfile,
  TruthRead,
} from "@/lib/intelligence/types";

export const RADAR_BOARD_QUALITY_FLOOR = 0.72;

export function scoreRadarCandidate(input: {
  signal: SignalProfile;
  judgment: JarvisJudgment;
  truth: TruthRead;
  currentBoard?: RadarItem[];
  context?: JarvisContext;
}): RadarScore {
  const { signal, judgment, truth, currentBoard = [], context } = input;
  const redundancyPenalty = redundancyFor(signal.diversityGroup, currentBoard);
  const northAlignment = computeNorthAlignment({
    itemTags: [
      signal.category,
      signal.type,
      signal.vibe,
      signal.purposeLabel,
      ...signal.positiveSignals,
    ],
    itemText: [
      signal.moveTitle,
      signal.reasonSurfaced,
      signal.strongestAngle,
      judgment.reason,
    ].join(" "),
    northTags: context?.northTags,
  });
  const energyCost = signal.effort === "high" ? 0.7 : signal.effort === "medium" ? 0.4 : 0.18;
  const moneyCost =
    signal.spend === "high" ? 0.75 : signal.spend === "paid" ? 0.48 : signal.spend === "low" ? 0.24 : 0.08;
  const planPotential = planPotentialFor(signal, truth);
  const socialUpside = signal.socialWeight;
  const creativeUpside = /creative|culture|style|content/.test(signal.vibe) ? 0.72 : 0.36;
  const longTermValue =
    /money|ownership|work|creative|body/.test(signal.vibe) || /Ownership|Skill|Health|Business/i.test(signal.purposeLabel)
      ? 0.72
      : 0.48;
  const usefulness = clamp01(
    0.38 +
      signal.confidence * 0.22 +
      signal.evidenceQuality * 0.18 +
      signal.tasteFit * 0.14 +
      (signal.suggestedAction === "plan" || signal.suggestedAction === "save" ? 0.08 : 0),
  );
  const vibeStrength = clamp01(signal.positiveSignals.length * 0.08 + signal.tasteFit * 0.7);
  const total = clamp01(
    judgment.confidence * 0.2 +
      signal.tasteFit * 0.16 +
      signal.confidence * 0.12 +
      signal.urgency * 0.08 +
      signal.novelty * 0.08 +
      usefulness * 0.16 +
      vibeStrength * 0.08 +
      planPotential * 0.08 +
      truth.evidenceQuality * 0.08 +
      socialUpside * 0.03 +
      creativeUpside * 0.03 +
      longTermValue * 0.04 -
      energyCost * 0.035 -
      moneyCost * 0.035 -
      redundancyPenalty +
      northAlignment.score * 0.045,
  );

  return {
    total,
    tasteFit: signal.tasteFit,
    timingFit: signal.urgency,
    novelty: signal.novelty,
    usefulness,
    vibeStrength,
    planPotential,
    evidenceQuality: truth.evidenceQuality,
    socialUpside,
    creativeUpside,
    longTermValue,
    energyCost,
    moneyCost,
    redundancyPenalty,
    northAlignment,
  };
}

function planPotentialFor(signal: SignalProfile, truth: TruthRead): number {
  let score = 0.42;
  if (signal.suggestedAction === "plan") score += 0.2;
  if (signal.timingWindow) score += 0.08;
  if (truth.knownDetails.includes("Location")) score += 0.08;
  if (truth.evidenceQuality > 0.72) score += 0.12;
  if (truth.missingDetails.length > 3) score -= 0.1;
  return clamp01(score);
}

function redundancyFor(group: string, currentBoard: RadarItem[]): number {
  const count = currentBoard.filter((item) => item.diversityGroup === group).length;
  if (count <= 0) return 0;
  if (count === 1) return 0.06;
  return 0.14 + count * 0.04;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
