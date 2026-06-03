import "server-only";

import { getObservation, updateObservation } from "@/lib/chat/observations";
import { buildRadarCandidate } from "@/lib/chat/research/buildRadarCandidate";
import type {
  ImageAnalysisResult,
  ResearchSubjectResult,
  TasteFitJudgment,
} from "@/lib/chat/types";

export async function addToRadarFromObservation(input: {
  userId: string;
  observationId: string;
  userConfirmed?: boolean;
}): Promise<{ itemId: string; reused: boolean }> {
  const observation = await getObservation(input.userId, input.observationId);
  if (!observation) throw new Error("Observation not found.");

  const metadata = isRecord(observation.metadata) ? observation.metadata : {};
  const analysis = isRecord(metadata.image_analysis)
    ? (metadata.image_analysis as ImageAnalysisResult)
    : undefined;
  const research = isRecord(metadata.research)
    ? (metadata.research as ResearchSubjectResult)
    : null;
  const taste = isRecord(metadata.taste_fit)
    ? (metadata.taste_fit as TasteFitJudgment)
    : {
        fit: "medium",
        score: Number(observation.confidence ?? 0.55),
        summary: "Saved from observation by explicit user action.",
        role: "maybe",
        cautions: [],
      } satisfies TasteFitJudgment;

  const result = await buildRadarCandidate({
    userId: input.userId,
    observationId: input.observationId,
    analysis,
    research,
    taste,
    userConfirmed: input.userConfirmed ?? true,
  });
  await updateObservation({
    userId: input.userId,
    observationId: input.observationId,
    state: "saved_to_radar",
    metadataPatch: { radar_item_id: result.itemId, radar_reused: result.reused },
  });
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
