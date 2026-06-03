import "server-only";

import { composeSurfaceCopy } from "@/lib/intelligence/compose";
import { judgeSignal } from "@/lib/intelligence/judgment";
import { RADAR_UNDERFILLED_PROMOTION_FLOOR } from "@/lib/brain/constants";
import { evaluatePlanReadiness } from "@/lib/intelligence/radarPlanReadiness";
import { scoreRadarCandidate } from "@/lib/intelligence/radarScoring";
import { profileSignal } from "@/lib/intelligence/signalProfile";
import { readTruth } from "@/lib/intelligence/truth";
import type { IndexedItem } from "@/lib/index/types";
import type {
  JarvisContext,
  PlanReadiness,
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
  const radarDisposition = radarDispositionFor(decision);
  const todayDisposition =
    decision.signal.urgency >= 0.65 && Boolean(decision.signal.timingWindow)
      ? "today"
      : "not_today";
  const planDisposition = planDispositionFor(decision.planReadiness);
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
    radarDisposition,
    todayDisposition,
    planDisposition,
    planSlug: readPlanSlug(input.item.rawPayload),
    canGeneratePlan: !readPlanSlug(input.item.rawPayload),
    diversityGroup: decision.signal.diversityGroup,
    decision: decision.judgment.decision,
    northAlignment: decision.score.northAlignment,
  };
}

function radarDispositionFor(decision: SurfaceDecision): RadarItem["radarDisposition"] {
  if (decision.judgment.admission === "archive" || decision.judgment.admission === "discovered") {
    return "archive";
  }
  if (decision.judgment.admission === "radar") return "active";
  if (
    decision.signal.confidence >= RADAR_UNDERFILLED_PROMOTION_FLOOR &&
    decision.signal.tasteFit >= 0.52 &&
    decision.truth.evidenceQuality >= 0.45 &&
    decision.copy.title.trim().length > 0 &&
    decision.copy.reasonSurfaced.trim().length > 0 &&
    !hasHardRadarBlock(decision.signal.negativeFlags)
  ) {
    return "active";
  }
  return "holding";
}

function planDispositionFor(readiness: PlanReadiness): RadarItem["planDisposition"] {
  if (readiness.shouldPreparePlan) return "ready";
  if (readiness.confidence >= 0.55) return "seed";
  return "not_ready";
}

function hasHardRadarBlock(flags: string[]): boolean {
  return flags.some((flag) =>
    [
      "weak_evidence",
      "social_noise",
      "instagram_noise",
      "facebook_noise",
      "raw_comment",
      "too_literal",
      "closed_event",
      "expired_event",
      "misclassified",
      "no_clear_move",
      "title_unclear",
      "directory_spam",
      "seo_junk",
      "source_lead_only",
      "generic",
      "not_actionable",
      "fake_luxury",
      "corny",
      "hype_noise",
    ].includes(flag),
  );
}

function readPlanSlug(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const slug = value.plan_slug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
