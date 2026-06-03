import "server-only";

import { getAnthropicClient, hasAnthropic, DEFAULT_MODEL } from "@/lib/ai/anthropic";
import { buildBrainContext } from "@/lib/brain/context";
import {
  hasGooglePlaces,
  searchPlaces,
  getPlacePhotoUrl,
} from "@/lib/sources/googlePlaces";
import type { IndexedItem } from "@/lib/index/types";

/** LLM-generated decision fields shown on the redesigned brief. */
export type BriefFields = {
  short_title: string;
  jarvis_line: string;
  who_its_for: string;
  price_estimate: string;
};

/** Full persisted brief blob stored under surfaced_items.payload.brief. */
export type BriefData = BriefFields & {
  hero_image_url: string | null;
  brief_generated_at: string;
};

/**
 * Generate the four brief fields in a single structured call. One round-trip
 * (cheaper than four parallel calls) returning strict JSON, parsed defensively.
 * Falls back to deterministic values derived from the item when the model is
 * unavailable or returns something unparseable.
 */
export async function generateBriefFields(
  item: IndexedItem,
): Promise<BriefFields> {
  const fallback = fallbackFields(item);
  if (!hasAnthropic()) return fallback;
  const brainContext = await buildBrainContext({ includeWeather: false }).catch(() => null);

  const context = [
    `Name: ${item.title}`,
    `Category: ${item.category ?? item.type ?? "unknown"}`,
    `Location: ${item.locationName ?? item.address ?? "unknown"}`,
    `Description: ${item.description ?? "No description available"}`,
    `Tags: ${item.tags.length ? item.tags.join(", ") : "none"}`,
    "",
    renderUserContext(brainContext),
  ].join("\n");

  const prompt = `${context}

Return ONLY a JSON object (no markdown, no prose) with exactly these keys:
{
  "short_title": "2-4 words. The core name, trimmed. Drop filler like 'The' and location suffixes.",
  "jarvis_line": "One sentence as a trusted friend who knows this person's taste exactly. A take, not a description. Confident, specific, understated. Max 15 words. No quotes.",
  "who_its_for": "One short line about who this is best experienced with, given the user's life context. No labels, no quotes.",
  "price_estimate": "Real cost per person, specific: '$45-65 per person' or 'Free, drinks $12-18' or '$200+ tasting menu'. If truly unknown: 'Price unknown'."
}`;

  try {
    const res = await getAnthropicClient().messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    const parsed = parseJsonObject(text);
    if (!parsed) return fallback;
    return {
      short_title: pick(parsed.short_title, fallback.short_title),
      jarvis_line: pick(parsed.jarvis_line, fallback.jarvis_line),
      who_its_for: pick(parsed.who_its_for, fallback.who_its_for),
      price_estimate: pick(parsed.price_estimate, fallback.price_estimate),
    };
  } catch (error) {
    console.error("[briefFields] generate", error);
    return fallback;
  }
}

/**
 * Resolve a hero image for the brief. Prefer the item's own image; otherwise
 * pull the first Google Places photo for the venue. Returns null on miss so
 * the component can render its fallback panel.
 */
export async function getBriefHeroImage(
  item: IndexedItem,
): Promise<string | null> {
  if (item.imageUrl) return item.imageUrl;
  if (!hasGooglePlaces()) return null;
  if (item.lat == null || item.lng == null) return null;
  try {
    const query = `${item.title} ${item.locationName ?? item.address ?? ""}`.trim();
    const places = await searchPlaces({
      query,
      lat: item.lat,
      lng: item.lng,
      maxResults: 1,
    });
    const photoName = places[0]?.photos?.[0]?.name;
    if (!photoName) return null;
    return getPlacePhotoUrl({ photoName, maxWidthPx: 1200 });
  } catch (error) {
    console.error("[briefFields] heroImage", error);
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderUserContext(context: Awaited<ReturnType<typeof buildBrainContext>> | null): string {
  if (!context) return "User context: no saved profile context available.";
  const lines = [
    context.founder.currentFocus ? `Current focus: ${context.founder.currentFocus}` : null,
    context.founder.lifeDirection ? `Long arc: ${context.founder.lifeDirection}` : null,
    context.founder.vibeKeywords.length
      ? `Taste words: ${context.founder.vibeKeywords.slice(0, 10).join(", ")}`
      : null,
    context.founder.avoidKeywords.length
      ? `Avoid: ${context.founder.avoidKeywords.slice(0, 10).join(", ")}`
      : null,
    context.founder.dealbreakers.length
      ? `Dealbreakers: ${context.founder.dealbreakers.slice(0, 8).join(" | ")}`
      : null,
    context.northTags.length ? `North tags: ${context.northTags.slice(0, 12).join(", ")}` : null,
    context.memory.length
      ? `Memory: ${context.memory.slice(0, 8).map((m) => m.content).join(" | ")}`
      : null,
    context.recentActions.length
      ? `Recent actions: ${context.recentActions
          .slice(0, 8)
          .map((a) => `${a.status}: ${a.title}`)
          .join(" | ")}`
      : null,
  ].filter(Boolean);
  return lines.length ? `User context:\n${lines.join("\n")}` : "User context: no saved profile context available.";
}

function fallbackFields(item: IndexedItem): BriefFields {
  return {
    short_title: trimTitle(item.title),
    jarvis_line: item.subtitle?.trim() || "Worth a closer look.",
    who_its_for: "Good alone. Better with someone worth the conversation.",
    price_estimate: "Price unknown",
  };
}

function trimTitle(title: string): string {
  const cleaned = title.replace(/^the\s+/i, "").trim();
  const words = cleaned.split(/\s+/);
  return words.slice(0, 4).join(" ");
}

function pick(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
