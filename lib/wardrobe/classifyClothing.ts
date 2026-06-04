import "server-only";
import { getAnthropicClient, hasAnthropic, DEFAULT_MODEL } from "@/lib/ai/anthropic";

export type ClothingClassification = {
  isClothing: boolean;
  category: "tops" | "bottoms" | "shoes" | "outerwear" | "accessories" | "headwear" | null;
  color: string | null;
  secondaryColor: string | null;
  formality: "casual" | "smart-casual" | "business" | "formal" | null;
  season: string[];
  activityTags: string[];
  brand: string | null;
  description: string;
  condition: "great" | "good" | "worn" | null;
};

const SYSTEM = `You are classifying a clothing item from a photo for a personal wardrobe system.

Return strict JSON:
{
  "isClothing": boolean,
  "category": "tops" | "bottoms" | "shoes" | "outerwear" | "accessories" | "headwear" | null,
  "color": string | null,
  "secondaryColor": string | null,
  "formality": "casual" | "smart-casual" | "business" | "formal" | null,
  "season": string[],
  "activityTags": string[],
  "brand": string | null,
  "description": string,
  "condition": "great" | "good" | "worn" | null
}

Rules:
- isClothing: false if not a clothing/footwear/accessory item
- season: subset of ["spring", "summer", "fall", "winter"]
- activityTags: relevant subset of ["casual", "dining", "office", "outdoor", "golf", "riding", "event", "athletic", "travel"]
- description: one concise line describing the item (e.g. "Olive linen overshirt, relaxed fit")
- condition: estimate from how it looks in the photo; default to "good" if unclear
- All fields null if isClothing is false`;

export async function classifyClothing(input: {
  imageBase64: string;
  mediaType?: string;
}): Promise<ClothingClassification> {
  const fallback: ClothingClassification = {
    isClothing: false,
    category: null,
    color: null,
    secondaryColor: null,
    formality: null,
    season: [],
    activityTags: [],
    brand: null,
    description: "Unclassified",
    condition: null,
  };

  if (!hasAnthropic() || !input.imageBase64) return fallback;

  const validTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  const mediaType = validTypes.has(input.mediaType ?? "") ? input.mediaType! : "image/jpeg";

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 300,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: input.imageBase64,
              },
            },
            { type: "text", text: "Classify this clothing item." },
          ],
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ClothingClassification>;
    return {
      isClothing: Boolean(parsed.isClothing),
      category: parsed.category ?? null,
      color: parsed.color ?? null,
      secondaryColor: parsed.secondaryColor ?? null,
      formality: parsed.formality ?? null,
      season: Array.isArray(parsed.season) ? parsed.season : [],
      activityTags: Array.isArray(parsed.activityTags) ? parsed.activityTags : [],
      brand: parsed.brand ?? null,
      description: typeof parsed.description === "string" ? parsed.description : "Item",
      condition: parsed.condition ?? "good",
    };
  } catch {
    return fallback;
  }
}
