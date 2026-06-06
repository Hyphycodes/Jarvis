import "server-only";

import { DEFAULT_MODEL, getAnthropicClient, hasAnthropic } from "@/lib/ai/anthropic";

const VALID_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export const WARDROBE_CATEGORIES = [
  "tops",
  "bottoms",
  "outerwear",
  "shoes",
  "accessories",
  "headwear",
] as const;
export type WardrobeCategory = (typeof WARDROBE_CATEGORIES)[number];

export type GarmentExtraction = {
  /** Short canonical name, e.g. "brown short-sleeve camp shirt". */
  name: string;
  category: WardrobeCategory;
  color: string | null;
  secondary_color: string | null;
  pattern: string | null;
  material: string | null;
  brand: string | null;
  formality: string | null; // casual | smart-casual | formal | athletic
  season: string[]; // spring/summer/fall/winter/all
  fit_silhouette: string | null; // slim, relaxed, oversized, tailored...
  condition: string | null; // new | good | worn
  style_notes: string | null;
  confidence: number; // 0..1 in the identification
  /** True when this is background clutter / not the owner's garment → skip it. */
  ignore: boolean;
};

const SYSTEM_PROMPT = `You are Jarvis's WARDROBE VISION analyst. From a photo (outfit/mirror selfie, flat-lay, closet shot, product screenshot, or single item) extract each distinct CLOTHING ITEM or relevant accessory that belongs to the owner.

Return strict JSON: { "items": GarmentExtraction[] }
GarmentExtraction = {
  "name": string,                // short canonical name, e.g. "navy linen camp shirt"
  "category": "tops"|"bottoms"|"outerwear"|"shoes"|"accessories"|"headwear",
  "color": string|null,          // primary color, specific ("charcoal", not "dark")
  "secondary_color": string|null,
  "pattern": string|null,        // solid|striped|plaid|check|floral|graphic|...
  "material": string|null,       // best fabric guess: cotton|linen|denim|wool|leather|knit|... null if unsure
  "brand": string|null,          // only if a logo/tag is visible OR provided in context
  "formality": string|null,      // casual|smart-casual|formal|athletic
  "season": string[],            // any of spring|summer|fall|winter|all
  "fit_silhouette": string|null, // slim|regular|relaxed|oversized|tailored|cropped
  "condition": string|null,      // new|good|worn
  "style_notes": string|null,    // one short editorial note
  "confidence": number,          // 0..1 — how sure you are about this item's identity
  "ignore": boolean              // true ONLY for things to exclude (see rules)
}

RULES — be disciplined:
- Extract ONLY garments/accessories the owner is wearing or clearly showing. ONE entry per distinct item.
- Set ignore=true (or omit) for: background clutter, furniture, store racks, shadows, walls, plants, other people's clothing, items on the floor, and anything not clearly the owner's piece.
- Do NOT invent a brand. Only set brand from a visible logo/label or the provided context.
- material/pattern/fit are best-effort; use null when genuinely unsure and lower confidence.
- If the photo is a single product/screenshot, return that one item.
- Honor the user context note exactly (e.g. "most are Zara", "ignore the clothes on the floor", "that jacket isn't mine", "these are old photos"). If the note says to ignore something or that an item isn't theirs, set ignore=true for it.
- Prefer fewer, accurate items over many speculative ones.`;

export async function analyzeGarments(input: {
  imageBase64: string;
  mediaType?: string;
  contextNote?: string;
}): Promise<GarmentExtraction[]> {
  if (!hasAnthropic() || !input.imageBase64) return [];
  const mediaType = VALID_MEDIA_TYPES.has(input.mediaType ?? "")
    ? input.mediaType!
    : "image/jpeg";

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1600,
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
                user_context: input.contextNote ?? "",
                instruction: "Extract the owner's garments. Return JSON { items: [...] } only.",
              }),
            },
          ],
        },
      ],
    });
    const raw = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const parsed = JSON.parse(stripFence(raw)) as { items?: unknown };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return items.map(normalizeGarment).filter((g): g is GarmentExtraction => g !== null && !g.ignore);
  } catch (err) {
    console.error("[wardrobe.analyzeGarments] failed", err instanceof Error ? err.message : err);
    return [];
  }
}

function normalizeGarment(value: unknown): GarmentExtraction | null {
  if (!isRecord(value)) return null;
  const category = normalizeCategory(value.category);
  if (!category) return null;
  const name = str(value.name) ?? `${str(value.color) ?? ""} ${category}`.trim();
  if (!name) return null;
  return {
    name,
    category,
    color: str(value.color),
    secondary_color: str(value.secondary_color),
    pattern: str(value.pattern),
    material: str(value.material),
    brand: str(value.brand),
    formality: str(value.formality),
    season: strArray(value.season),
    fit_silhouette: str(value.fit_silhouette),
    condition: str(value.condition) ?? "good",
    style_notes: str(value.style_notes),
    confidence: clamp01(typeof value.confidence === "number" ? value.confidence : 0.5),
    ignore: value.ignore === true,
  };
}

function normalizeCategory(value: unknown): WardrobeCategory | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((WARDROBE_CATEGORIES as readonly string[]).includes(raw)) return raw as WardrobeCategory;
  if (/shirt|tee|t-shirt|top|hoodie|sweater|knit|polo|blouse/.test(raw)) return "tops";
  if (/pant|trouser|jean|short|bottom|chino|skirt/.test(raw)) return "bottoms";
  if (/jacket|coat|outer|blazer|overshirt|parka/.test(raw)) return "outerwear";
  if (/shoe|sneaker|boot|loafer|sandal|footwear/.test(raw)) return "shoes";
  if (/hat|cap|beanie|headwear/.test(raw)) return "headwear";
  if (/belt|watch|bag|accessor|scarf|glasses|sunglasses|jewel/.test(raw)) return "accessories";
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim().toLowerCase())
    : [];
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stripFence(value: string): string {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
}
