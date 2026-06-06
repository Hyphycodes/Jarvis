import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  generateBriefFields,
  getBriefHeroImage,
  type BriefData,
} from "@/lib/items/briefFields";
import type { IndexedItem } from "@/lib/index/types";
import type { Json } from "@/lib/types/database";

/**
 * Resolve the persisted brief blob for an item. If a complete brief already
 * lives in payload.brief it is returned untouched (never regenerated). Otherwise
 * the fields + hero image are generated once, persisted back to
 * surfaced_items.payload.brief, and returned. Persistence failures are
 * swallowed — the brief still renders for this request.
 */
export async function resolveBrief(
  item: IndexedItem,
  opts: { userId?: string } = {},
): Promise<BriefData> {
  const existing = readBrief(item.rawPayload);
  if (existing) {
    // Backfill the image_url column if a hero exists but never landed there —
    // the Radar feed reads image_url first, so this is what surfaces photos.
    if (existing.hero_image_url && !item.imageUrl) {
      await persistHeroToColumn(item, existing.hero_image_url);
    }
    return existing;
  }

  const [fields, heroImage] = await Promise.all([
    generateBriefFields(item, { userId: opts.userId }),
    getBriefHeroImage(item),
  ]);

  const brief: BriefData = {
    ...fields,
    hero_image_url: heroImage,
    brief_generated_at: new Date().toISOString(),
  };

  await persistBrief(item, brief);
  if (heroImage && !item.imageUrl) {
    await persistHeroToColumn(item, heroImage);
  }
  return brief;
}

function readBrief(payload: Json): BriefData | null {
  if (!isRecord(payload)) return null;
  const raw = payload.brief;
  if (!isRecord(raw)) return null;
  const { short_title, jarvis_line, who_its_for, price_estimate } = raw;
  if (
    typeof short_title !== "string" ||
    typeof jarvis_line !== "string" ||
    typeof who_its_for !== "string" ||
    typeof price_estimate !== "string"
  ) {
    return null;
  }
  return {
    short_title,
    jarvis_line,
    who_its_for,
    price_estimate,
    hero_image_url:
      typeof raw.hero_image_url === "string" ? raw.hero_image_url : null,
    brief_generated_at:
      typeof raw.brief_generated_at === "string"
        ? raw.brief_generated_at
        : new Date().toISOString(),
  };
}

async function persistBrief(item: IndexedItem, brief: BriefData): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const currentPayload = isRecord(item.rawPayload) ? item.rawPayload : {};
    const nextPayload = { ...currentPayload, brief } as Json;
    const { error } = await supabase
      .from("surfaced_items")
      .update({ payload: nextPayload })
      .eq("id", item.id);
    if (error) console.error("[resolveBrief] persist", error);
  } catch (error) {
    console.error("[resolveBrief] persist", error);
  }
}

async function persistHeroToColumn(
  item: IndexedItem,
  heroImageUrl: string,
): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase
      .from("surfaced_items")
      .update({ image_url: heroImageUrl })
      .eq("id", item.id)
      .is("image_url", null);
    if (error) console.error("[resolveBrief] persistHero", error);
  } catch (error) {
    console.error("[resolveBrief] persistHero", error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
