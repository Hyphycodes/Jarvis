import "server-only";

import { composeSurfaceCopy } from "@/lib/intelligence/compose";
import { judgeSignal } from "@/lib/intelligence/judgment";
import { evaluatePlanReadiness } from "@/lib/intelligence/radarPlanReadiness";
import { scoreRadarCandidate } from "@/lib/intelligence/radarScoring";
import { profileSignal } from "@/lib/intelligence/signalProfile";
import { readTruth } from "@/lib/intelligence/truth";
import type { IndexedItem } from "@/lib/index/types";
import type {
  JarvisContext,
  PlanDecision,
  RadarItem,
  SurfaceDecision,
} from "@/lib/intelligence/types";

export function evaluateForSurface(input: {
  item: IndexedItem;
  context?: JarvisContext;
  currentBoard?: RadarItem[];
}): SurfaceDecision {
  const signal = profileSignal(input.item, input.context);
  const judgment = judgeSignal(input.item, input.context);
  const truth = readTruth(input.item);
  const copy = composeSurfaceCopy({ signal, truth });
  const score = scoreRadarCandidate({
    signal,
    judgment,
    truth,
    currentBoard: input.currentBoard,
    context: input.context,
  });
  const planReadiness = evaluatePlanReadiness({
    item: input.item,
    signal,
    truth,
    score,
  });

  return {
    item: input.item,
    signal,
    judgment,
    truth,
    copy,
    score,
    planReadiness,
  };
}

export function evaluateForPlan(input: {
  item: IndexedItem;
  context?: JarvisContext;
}): PlanDecision {
  const decision = evaluateForSurface(input);
  return {
    shouldPrepare: decision.planReadiness.shouldPreparePlan,
    readiness: decision.planReadiness,
  };
}

export function enrichRadarItem(input: {
  item: IndexedItem;
  context?: JarvisContext;
  currentBoard?: RadarItem[];
}): RadarItem {
  const decision = evaluateForSurface(input);
  return {
    item: input.item,
    title: decision.copy.title,
    category: decision.signal.category,
    vibe: decision.signal.vibe,
    reasonSurfaced: decision.copy.reasonSurfaced,
    strongestAngle: decision.copy.strongestAngle,
    confidence: decision.judgment.confidence,
    score: decision.score.total,
    scoreBreakdown: decision.score,
    planReadiness: decision.planReadiness,
    source: {
      source: input.item.source,
      domain: decision.signal.sourceDomain,
    },
    evidence: {
      quality: decision.truth.evidenceQuality,
      summary: input.item.briefing?.evidence_summary,
    },
    missingInfo: decision.truth.missingDetails,
    suggestedAction: decision.signal.suggestedAction,
    planSlug: readPlanSlug(input.item.rawPayload),
    canGeneratePlan: !readPlanSlug(input.item.rawPayload),
    diversityGroup: decision.signal.diversityGroup,
    decision: decision.judgment.decision,
  };
}

function readPlanSlug(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const slug = value.plan_slug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

