import "server-only";

import { analyzeImage } from "@/lib/chat/analyzeImage";
import { ingestWardrobePhoto } from "@/lib/wardrobe/intake";
import {
  entitiesFromImageAnalysis,
  upsertObservationEntities,
} from "@/lib/chat/entities";
import { createObservation, updateObservation } from "@/lib/chat/observations";
import { recordChatBehaviorSignal } from "@/lib/chat/behaviorSignals";
import { buildRadarCandidate } from "@/lib/chat/research/buildRadarCandidate";
import { judgeTasteFit } from "@/lib/chat/research/judgeTasteFit";
import { researchSubject } from "@/lib/chat/research/researchSubject";
import { inferImageMission } from "@/lib/chat/research/imageMission";
import { runLiveResearch } from "@/lib/chat/research/liveResearch";
import type { ChatContextPacket } from "@/lib/chat/context/types";
import type {
  ChatAttachment,
  ChatChip,
  ChatIntakeResult,
  ImageAnalysisResult,
  PlanningState,
} from "@/lib/chat/types";

export async function handleImageDrop(input: {
  userId: string;
  message: string;
  attachment: Extract<ChatAttachment, { type: "image" }>;
  /**
   * Additional images sent in the same turn. Wardrobe/closet batches are
   * handled by the durable import job (see lib/wardrobe/importJobs.ts) before
   * this handler is reached; this path only covers single non-wardrobe images.
   */
  siblingImages?: Array<Extract<ChatAttachment, { type: "image" }>>;
  context: ChatContextPacket;
  commitmentMode?: boolean;
}): Promise<ChatIntakeResult> {
  const observation = await createObservation({
    userId: input.userId,
    sourceType: "image",
    interpretedType: "pending_image_analysis",
    confidence: 0.4,
    state: "observed",
    metadata: {
      label: input.attachment.label ?? "Photo",
      media_type: input.attachment.image_media_type ?? "image/jpeg",
      has_inline_image: true,
      user_text: input.message,
    },
  });

  const analysis = await analyzeImage({
    imageBase64: input.attachment.image_base64,
    mediaType: input.attachment.image_media_type,
    userText: input.message,
  });
  // Side-effect: a lone clothing photo with no closet intent still gets logged
  // to the wardrobe in the background. Fire-and-forget — never blocks the chat
  // response. (Multi-photo / explicit closet uploads take the durable import
  // job path and never reach here.)
  if (analysis.type === "outfit") {
    void ingestWardrobePhoto({
      userId: input.userId,
      imageBase64: input.attachment.image_base64,
      mediaType: input.attachment.image_media_type,
    }).catch(() => {});
  }

  const entities = entitiesFromImageAnalysis(analysis);
  await upsertObservationEntities({
    userId: input.userId,
    observationId: observation.id,
    entities,
  });

  await updateObservation({
    userId: input.userId,
    observationId: observation.id,
    extractedText: extractedText(analysis),
    interpretedType: analysis.type,
    entitiesJson: entities.map((entity) => ({
      type: entity.type,
      name: entity.name,
      canonical_name: entity.canonicalName,
      role: entity.role,
      confidence: entity.confidence,
    })),
    confidence: confidenceNumber(analysis.confidence),
    state: "recognized",
    metadataPatch: {
      image_analysis: analysis,
    },
  });

  // ── Mission vs capture ────────────────────────────────────────────────────
  // Before treating the image as a venue to save, ask what it's *asking for*.
  // A friend's text ("craving Asian for bday dinner, any reccs?") is a mission:
  // infer the job, research it, surface real places, and tee up a reply — the
  // owner shouldn't have to explain the screenshot.
  const mission = await inferImageMission({ analysis, userText: input.message });
  if (mission.isMission && mission.query) {
    const research = await runLiveResearch({ userId: input.userId, query: mission.query });
    await updateObservation({
      userId: input.userId,
      observationId: observation.id,
      state: "researched",
      metadataPatch: { mission, research_places: research.places.length },
    });
    return {
      observationId: observation.id,
      analysis,
      places: research.places,
      state: "researched",
      chips: [],
      contextBlock: buildMissionContextBlock({ mission, research, analysis }),
    };
  }

  const research = await researchSubject({
    analysis,
    entities,
    sourceUrl: analysis.extracted.website_or_url ?? null,
    snippet: extractedText(analysis),
  });
  if (research) {
    await updateObservation({
      userId: input.userId,
      observationId: observation.id,
      state: "researched",
      metadataPatch: { research },
    });
  }

  const taste = await judgeTasteFit({
    context: input.context,
    analysis,
    research,
  });
  await updateObservation({
    userId: input.userId,
    observationId: observation.id,
    metadataPatch: { taste_fit: taste },
  });

  let state: PlanningState = research ? "researched" : "recognized";
  let radarItemId: string | undefined;
  if (shouldAutoRadar(analysis, taste)) {
    const candidate = await buildRadarCandidate({
      userId: input.userId,
      observationId: observation.id,
      analysis,
      research,
      taste,
      userConfirmed: false,
    });
    radarItemId = candidate.itemId;
    state = "saved_to_radar";
    await updateObservation({
      userId: input.userId,
      observationId: observation.id,
      state,
      metadataPatch: { radar_item_id: radarItemId, radar_reused: candidate.reused },
    });
    await recordChatBehaviorSignal({
      userId: input.userId,
      signalType: "saved",
      objectType: "radar_item",
      objectId: radarItemId,
      payload: { source: "image_intake", observation_id: observation.id },
    });
  }

  return {
    observationId: observation.id,
    radarItemId,
    analysis,
    research,
    taste,
    contextBlock: buildImageContextBlock({
      observationId: observation.id,
      radarItemId,
      analysis,
      research,
      taste,
      state,
    }),
    chips: chipsForImage({
      observationId: observation.id,
      radarItemId,
      analysis,
      state,
    }),
    state,
  };
}

function shouldAutoRadar(
  analysis: ImageAnalysisResult,
  taste: { fit: string; score: number; role: string },
) {
  return (
    analysis.confidence === "high" &&
    taste.fit === "strong" &&
    taste.score >= 0.72 &&
    (taste.role === "radar_item" || taste.role === "maybe")
  );
}

function chipsForImage(input: {
  observationId: string;
  radarItemId?: string;
  analysis: ImageAnalysisResult;
  state: PlanningState;
}): ChatChip[] {
  const payload = {
    observation_id: input.observationId,
    item_id: input.radarItemId,
    account_name: input.analysis.extracted.account_name,
    account_display_name: input.analysis.extracted.account_display_name,
    source_url: input.analysis.extracted.website_or_url,
  };
  const chips: ChatChip[] = [
    {
      label: input.radarItemId ? "Kept in Radar" : "Save to Radar",
      message: "Save this to Radar.",
      action_type: "save_to_radar",
      payload,
    },
    {
      label: "Plan It",
      message: "Plan it.",
      action_type: "build_plan",
      payload,
    },
    {
      label: "Find Similar",
      message: "Find me a few similar options with the same vibe.",
      action_type: "send_message",
      payload,
    },
    {
      label: "Not My Vibe",
      message: "Not my vibe.",
      action_type: "not_my_vibe",
      payload,
    },
  ];

  if (input.analysis.recommended_action === "source_monitoring" || input.analysis.extracted.account_name) {
    chips.splice(1, 0, {
      label: "Monitor Source",
      message: "Monitor this source.",
      action_type: "monitor_source",
      payload,
    });
  }

  return chips;
}

function buildImageContextBlock(input: {
  observationId: string;
  radarItemId?: string;
  analysis: ImageAnalysisResult;
  research?: { summary: string; sourceUrl?: string | null } | null;
  taste?: { summary: string; fit: string; score: number; role: string } | null;
  state: PlanningState;
}) {
  const ex = input.analysis.extracted;
  return [
    `Observation: ${input.observationId}`,
    `Type: ${input.analysis.type}`,
    `Found: ${ex.venue_name ?? ex.event_name ?? ex.account_display_name ?? ex.account_name ?? ex.product_or_brand ?? "image intake"}`,
    `Extracted details: ${[
      ex.location,
      ex.cuisine_or_category,
      ex.event_date,
      ex.price_info,
      ex.vibe_description,
    ].filter(Boolean).join(" | ") || "No strong details extracted."}`,
    `Research: ${input.research?.summary ?? "Not enough to research deeply."}`,
    `Taste fit: ${input.taste ? `${input.taste.fit} (${Math.round(input.taste.score * 100)}%) - ${input.taste.summary}` : "Not judged."}`,
    `Action taken: ${input.radarItemId ? "radar candidate created" : "observation saved"}`,
    `Planning state: ${input.state}`,
  ].join("\n");
}

function buildMissionContextBlock(input: {
  mission: { query: string | null; replyAngle: string | null };
  research: Awaited<ReturnType<typeof runLiveResearch>>;
  analysis: ImageAnalysisResult;
}): string {
  const lines: string[] = ["[IMAGE MISSION — you read the screenshot as a job, not a thing to label]"];
  lines.push(
    `The owner dropped an image that's really a request. You inferred the job: "${input.mission.query}" and ran live research.`,
  );
  if (input.research.answer) lines.push(`Search synthesis: ${input.research.answer}`);
  if (input.research.places.length) {
    lines.push("Real places now showing as cards in the thread (reference by name, don't invent others):");
    input.research.places.forEach((p, i) => {
      lines.push(
        `${i + 1}. ${p.name}${p.neighborhood ? ` — ${p.neighborhood}` : ""}${p.priceTier ? ` (${p.priceTier})` : ""} [item_id ${p.itemId}] — ${p.hook}`,
      );
    });
  }
  lines.push(
    input.mission.replyAngle
      ? `Then hand the owner a ready-to-send reply they can paste back to the asker. Reply angle: ${input.mission.replyAngle}. Put the draft on its own line, in quotes.`
      : "Then hand the owner a short, ready-to-send reply they can paste back to the asker — on its own line, in quotes.",
  );
  lines.push("Confident and specific. Don't ask the owner to explain the screenshot — you already got it.");
  return lines.join("\n");
}

function extractedText(analysis: ImageAnalysisResult) {
  return [
    analysis.extracted.raw_text,
    analysis.extracted.caption_text,
    analysis.extracted.vibe_description,
  ].filter(Boolean).join("\n") || null;
}

function confidenceNumber(value: ImageAnalysisResult["confidence"]) {
  if (value === "high") return 0.85;
  if (value === "medium") return 0.62;
  return 0.35;
}
