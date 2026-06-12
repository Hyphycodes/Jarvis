import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import type { ImageAnalysisResult } from "@/lib/chat/types";

/**
 * A dropped image is not a recognition task — it's a mission. Someone texting
 * "craving Asian for bday dinner, any reccs?" is asking the owner to go do the
 * work, not asking Jarvis to label a screenshot. This decides whether an image
 * is a REQUEST/conversation to act on (mission) vs a thing to capture, and if a
 * mission, what job to research and the angle for a ready-to-send reply.
 */
export type ImageMission = {
  isMission: boolean;
  /** A clean research query (no city needed — research adds the home city). */
  query: string | null;
  /** One line on what the reply back to the asker should say. */
  replyAngle: string | null;
};

const SYSTEM = `An image was dropped into a private assistant by its owner. You decide what the image is ASKING FOR.

Two cases:
- CAPTURE: the image is a venue/flyer/menu/product/listing the owner is pointing at to save. Not a mission.
- MISSION: the image is a conversation, a text/DM, a request, or a list — someone asking the owner something ("any good Asian spots for a birthday?", "where should we eat Friday?", "find me a gift for X"). The owner wants the job done and a reply ready.

Return strict JSON:
{ "is_mission": boolean, "query": string|null, "reply_angle": string|null }

Rules:
- is_mission=true ONLY when the image clearly contains someone making a request/ask the owner would act on. A plain photo of a restaurant is is_mission=false.
- query: the actual job to research as a concise search ("fun Asian birthday dinner", "rooftop date spot", "weatherproof camera bag"). Omit the city — it's added downstream. null when not a mission.
- reply_angle: one short line describing what the owner's reply to the asker should convey (e.g. "Suggest 2-3 high-energy spots and offer to book"). null when not a mission.`;

type Raw = {
  is_mission?: boolean;
  query?: string | null;
  reply_angle?: string | null;
};

export async function inferImageMission(input: {
  analysis: ImageAnalysisResult;
  userText?: string;
}): Promise<ImageMission> {
  const none: ImageMission = { isMission: false, query: null, replyAngle: null };
  if (!hasAnthropic()) return none;

  const ex = input.analysis.extracted;
  const evidence = [
    `image_type: ${input.analysis.type}`,
    ex.raw_text ? `text_in_image: ${ex.raw_text}` : null,
    ex.caption_text ? `caption: ${ex.caption_text}` : null,
    ex.visible_people_or_context ? `context: ${ex.visible_people_or_context}` : null,
    ex.venue_name ? `venue_name: ${ex.venue_name}` : null,
    ex.product_or_brand ? `product: ${ex.product_or_brand}` : null,
    ex.location ? `location: ${ex.location}` : null,
    input.userText ? `owner_note: ${input.userText}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (!evidence.trim()) return none;

  try {
    const out = await generateStructured<Raw>({
      system: SYSTEM,
      prompt: evidence,
      schemaName: "ImageMission",
      temperature: 0,
      maxTokens: 300,
    });
    const query = typeof out.query === "string" ? out.query.trim() : "";
    if (!out.is_mission || !query) return none;
    return {
      isMission: true,
      query,
      replyAngle:
        typeof out.reply_angle === "string" && out.reply_angle.trim()
          ? out.reply_angle.trim()
          : null,
    };
  } catch {
    return none;
  }
}
