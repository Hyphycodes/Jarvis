import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { recordAiAction } from "@/lib/chat/aiActions";
import { normalizeRadarClassification } from "@/lib/radar/category";
import type { Json } from "@/lib/types/database";
import type {
  ImageAnalysisResult,
  ResearchSubjectResult,
  TasteFitJudgment,
} from "@/lib/chat/types";

export async function buildRadarCandidate(input: {
  userId: string;
  observationId: string;
  analysis?: ImageAnalysisResult;
  research?: ResearchSubjectResult | null;
  taste: TasteFitJudgment;
  userConfirmed?: boolean;
}): Promise<{ itemId: string; reused: boolean }> {
  const title = candidateTitle(input.analysis, input.research);
  if (!title) throw new Error("Not enough information to create a Radar candidate.");

  const supabase = await getServerSupabase();
  const canonical = canonicalTitle(title);
  const sourceUrl = input.research?.sourceUrl ?? input.analysis?.extracted.website_or_url ?? null;

  const { data: existingByObservation } = await supabase
    .from("surfaced_items")
    .select("id")
    .eq("user_id", input.userId)
    .eq("destination", "radar")
    .eq("source_observation_id", input.observationId)
    .limit(1);
  let existingId = ((existingByObservation ?? []) as Array<{ id: string }>)[0]?.id;
  if (!existingId) {
    const { data: existingByTitle } = await supabase
      .from("surfaced_items")
      .select("id")
      .eq("user_id", input.userId)
      .eq("destination", "radar")
      .ilike("title", title)
      .limit(1);
    existingId = ((existingByTitle ?? []) as Array<{ id: string }>)[0]?.id;
  }
  if (existingId) {
    await supabase
      .from("surfaced_items")
      .update({
        planning_state: "saved_to_radar",
        taste_fit_summary: input.taste.summary,
        confidence: input.taste.score,
      })
      .eq("id", existingId)
      .eq("user_id", input.userId);
    return { itemId: existingId, reused: true };
  }

  const payload: Json = {
    phase: 10,
    canonical_title: canonical,
    source_observation_id: input.observationId,
    image_analysis: input.analysis ?? null,
    research: input.research ?? null,
    taste_fit: input.taste,
    planning_state: "saved_to_radar",
  } as Json;
  const fallbackType = itemType(input.analysis, input.research);
  const classification = normalizeRadarClassification({
    category: input.analysis?.extracted.cuisine_or_category ?? input.research?.subjectType,
    type: fallbackType,
    title,
    subtitle: subtitle(input.analysis, input.research),
    description: description(input.analysis, input.research, input.taste),
    locationName: input.research?.location ?? input.analysis?.extracted.location,
    sourcePayload: payload,
  });

  const { data, error } = await supabase
    .from("surfaced_items")
    .insert({
      user_id: input.userId,
      destination: "radar",
      source: "ai",
      source_id: input.observationId,
      source_observation_id: input.observationId,
      type: classification.type ?? fallbackType,
      category: classification.category,
      title,
      subtitle: subtitle(input.analysis, input.research),
      description: description(input.analysis, input.research, input.taste),
      location_name: input.research?.location ?? input.analysis?.extracted.location ?? null,
      url: sourceUrl,
      payload,
      status: "shown",
      score: input.taste.score,
      confidence: input.taste.score,
      taste_fit_summary: input.taste.summary,
      planning_state: "saved_to_radar",
      reasons: [
        input.taste.summary,
        ...(input.research?.summary ? [input.research.summary] : []),
      ].slice(0, 3),
      tags: [
        "phase_10",
        "observation",
        input.analysis?.type ?? "intake",
        input.taste.fit,
      ].filter(Boolean),
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Radar insert failed");
  const itemId = (data as { id: string }).id;

  await recordAiAction({
    userId: input.userId,
    actionType: "create_radar_candidate",
    inputObservationId: input.observationId,
    targetTable: "surfaced_items",
    targetId: itemId,
    confidence: input.taste.score,
    reasoningSummary: input.taste.summary,
    wasUserConfirmed: input.userConfirmed ?? false,
    stateBefore: "researched",
    stateAfter: "saved_to_radar",
    metadata: payload,
  });

  return { itemId, reused: false };
}

function candidateTitle(
  analysis?: ImageAnalysisResult,
  research?: ResearchSubjectResult | null,
): string | null {
  return (
    research?.subjectName ??
    analysis?.extracted.venue_name ??
    analysis?.extracted.event_name ??
    analysis?.extracted.account_display_name ??
    analysis?.extracted.account_name ??
    analysis?.extracted.product_or_brand ??
    null
  );
}

function itemType(
  analysis?: ImageAnalysisResult,
  research?: ResearchSubjectResult | null,
) {
  if (research?.subjectType === "event" || analysis?.type === "event_listing" || analysis?.type === "flyer" || analysis?.type === "music_event") return "event";
  if (research?.subjectType === "place" || analysis?.extracted.venue_name) return "place";
  if (analysis?.type === "real_estate_listing") return "real_estate";
  if (analysis?.type === "product") return "product";
  if (analysis?.type === "outfit") return "style";
  return "recommendation";
}

function subtitle(
  analysis?: ImageAnalysisResult,
  research?: ResearchSubjectResult | null,
) {
  return [
    analysis?.extracted.location ?? research?.location,
    analysis?.extracted.event_date,
    analysis?.extracted.cuisine_or_category,
  ].filter(Boolean).join(" · ") || null;
}

function description(
  analysis: ImageAnalysisResult | undefined,
  research: ResearchSubjectResult | null | undefined,
  taste: TasteFitJudgment,
) {
  return (
    analysis?.extracted.vibe_description ??
    analysis?.extracted.caption_text ??
    research?.summary ??
    taste.summary
  );
}

function canonicalTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
