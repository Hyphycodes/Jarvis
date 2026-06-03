import "server-only";

import {
  DEFAULT_MODEL,
  getAnthropicClient,
  hasAnthropic,
} from "@/lib/ai/anthropic";
import type { ImageAnalysisResult, ImageType } from "@/lib/chat/types";

const VALID_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const SYSTEM_PROMPT = `You analyze screenshots and photos for Jarvis.

Default to recognition mode. Identify what the image appears to be, extract concrete details, and recommend only a light next action. Do not assume the user wants to plan, book, attend, buy, or commit.

Return strict JSON with:
{
  "type": ImageType,
  "extracted": {
    "venue_name": string?,
    "account_name": string?,
    "account_display_name": string?,
    "location": string?,
    "cuisine_or_category": string?,
    "event_name": string?,
    "event_date": string?,
    "price_info": string?,
    "caption_text": string?,
    "website_or_url": string?,
    "phone": string?,
    "vibe_description": string?,
    "raw_text": string?,
    "source_credibility_signal": string?,
    "visible_people_or_context": string?,
    "product_or_brand": string?,
    "document_type": string?
  },
  "recommended_action": "save_observation" | "save_to_radar" | "source_monitoring" | "answer_in_chat" | "none",
  "confidence": "high" | "medium" | "low"
}

Allowed ImageType values: place_photo, instagram_post, menu, flyer, event_listing, screenshot, outfit, interior_design, real_estate_listing, material_cert, construction_doc, music_event, product, food_plate, travel_spot, social_post, other.`;

export async function analyzeImage(input: {
  imageBase64: string;
  mediaType?: string;
  userText?: string;
}): Promise<ImageAnalysisResult> {
  if (!hasAnthropic()) {
    return fallbackAnalysis(input.userText, "Anthropic not configured.");
  }

  const mediaType = VALID_MEDIA_TYPES.has(input.mediaType ?? "")
    ? input.mediaType!
    : "image/jpeg";

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 900,
      temperature: 0.15,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: input.imageBase64,
              },
            },
            {
              type: "text",
              text: JSON.stringify({
                user_text: input.userText ?? "",
                instruction:
                  "Analyze the image for recognition-mode intake. Return JSON only.",
              }),
            },
          ],
        },
      ],
    });

    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    return normalizeAnalysis(JSON.parse(stripJsonFence(raw)));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[chat.analyzeImage] failed", reason);
    return fallbackAnalysis(input.userText, reason);
  }
}

function normalizeAnalysis(value: unknown): ImageAnalysisResult {
  const record = isRecord(value) ? value : {};
  const type = normalizeImageType(record.type);
  const extracted = isRecord(record.extracted) ? record.extracted : {};
  return {
    type,
    extracted: {
      venue_name: optionalString(extracted.venue_name),
      account_name: optionalString(extracted.account_name),
      account_display_name: optionalString(extracted.account_display_name),
      location: optionalString(extracted.location),
      cuisine_or_category: optionalString(extracted.cuisine_or_category),
      event_name: optionalString(extracted.event_name),
      event_date: optionalString(extracted.event_date),
      price_info: optionalString(extracted.price_info),
      caption_text: optionalString(extracted.caption_text),
      website_or_url: optionalString(extracted.website_or_url),
      phone: optionalString(extracted.phone),
      vibe_description: optionalString(extracted.vibe_description),
      raw_text: optionalString(extracted.raw_text),
      source_credibility_signal: optionalString(extracted.source_credibility_signal),
      visible_people_or_context: optionalString(extracted.visible_people_or_context),
      product_or_brand: optionalString(extracted.product_or_brand),
      document_type: optionalString(extracted.document_type),
    },
    recommended_action: normalizeAction(record.recommended_action),
    confidence:
      record.confidence === "high" || record.confidence === "medium" || record.confidence === "low"
        ? record.confidence
        : "low",
  };
}

function fallbackAnalysis(userText: string | undefined, reason: string): ImageAnalysisResult {
  return {
    type: "screenshot",
    extracted: {
      raw_text: userText?.trim() || undefined,
      vibe_description: "Image attached, but full visual analysis was unavailable.",
      source_credibility_signal: reason,
    },
    recommended_action: "save_observation",
    confidence: "low",
  };
}

function normalizeImageType(value: unknown): ImageType {
  const allowed: ImageType[] = [
    "place_photo",
    "instagram_post",
    "menu",
    "flyer",
    "event_listing",
    "screenshot",
    "outfit",
    "interior_design",
    "real_estate_listing",
    "material_cert",
    "construction_doc",
    "music_event",
    "product",
    "food_plate",
    "travel_spot",
    "social_post",
    "other",
  ];
  return allowed.includes(value as ImageType) ? (value as ImageType) : "other";
}

function normalizeAction(value: unknown): ImageAnalysisResult["recommended_action"] {
  switch (value) {
    case "save_observation":
    case "save_to_radar":
    case "source_monitoring":
    case "answer_in_chat":
    case "none":
      return value;
    default:
      return "save_observation";
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripJsonFence(value: string) {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
