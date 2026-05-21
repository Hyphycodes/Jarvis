import type { NormalizedCandidate } from "@/lib/ai/types";
import type { ScoreBreakdown, ScoringContext } from "@/lib/scoring/types";

export function scoreCandidate(
  candidate: NormalizedCandidate,
  context: ScoringContext = {},
): ScoreBreakdown {
  const tags = new Set(candidate.tags.map((tag) => tag.toLowerCase()));
  const preferred = context.preferredTags ?? [];
  const avoided = context.avoidTags ?? [];

  const tasteFit = clamp01(
    0.5 +
      preferred.filter((tag) => tags.has(tag.toLowerCase())).length * 0.1 -
      avoided.filter((tag) => tags.has(tag.toLowerCase())).length * 0.18,
  );
  const timing = candidate.datetime ? 0.7 : 0.45;
  const logistics = candidate.location ? 0.65 : 0.45;
  const atmosphere = tags.has("atmosphere") ? 0.7 : 0.5;
  const originality = tags.has("generic") ? 0.25 : 0.6;
  const relationshipValue = candidate.kind === "person" ? 0.75 : 0.35;
  const northAlignment = candidate.kind === "north_goal" ? 0.8 : 0.45;
  const confidence = candidate.source === "manual" ? 0.85 : 0.55;

  const total =
    tasteFit * 0.24 +
    timing * 0.14 +
    logistics * 0.14 +
    atmosphere * 0.14 +
    originality * 0.1 +
    relationshipValue * 0.1 +
    northAlignment * 0.1 +
    confidence * 0.04;

  return {
    total: round(total),
    tasteFit: round(tasteFit),
    timing: round(timing),
    logistics: round(logistics),
    atmosphere: round(atmosphere),
    originality: round(originality),
    relationshipValue: round(relationshipValue),
    northAlignment: round(northAlignment),
    confidence: round(confidence),
  };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
