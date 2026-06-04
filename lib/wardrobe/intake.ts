import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { classifyClothing } from "@/lib/wardrobe/classifyClothing";

/**
 * Classify a clothing photo and store it in wardrobe_items. Shared by the
 * intake route and the in-process chat side-effect so the insert logic lives
 * in one place. photo_url is a placeholder (`wardrobe:[id]`) — no Storage
 * needed; the classification metadata is the value.
 */
export async function ingestWardrobePhoto(input: {
  userId: string;
  imageBase64: string;
  mediaType?: string;
}): Promise<{
  stored: boolean;
  category?: string;
  description?: string;
  reason?: string;
}> {
  if (!input.imageBase64) return { stored: false, reason: "No image" };

  const classification = await classifyClothing({
    imageBase64: input.imageBase64,
    mediaType: input.mediaType,
  });

  if (!classification.isClothing || !classification.category) {
    return { stored: false, reason: "Not clothing" };
  }

  const supabase = getSupabaseServiceClient();
  const id = crypto.randomUUID();

  const { error } = await supabase.from("wardrobe_items").insert({
    id,
    user_id: input.userId,
    photo_url: `wardrobe:${id}`,
    category: classification.category,
    color: classification.color,
    secondary_color: classification.secondaryColor,
    formality: classification.formality,
    season: classification.season,
    activity_tags: classification.activityTags,
    brand: classification.brand,
    description: classification.description,
    condition: classification.condition ?? "good",
  });

  if (error) {
    console.error("[wardrobe/intake] insert failed", error.message);
    return { stored: false, reason: error.message };
  }

  return {
    stored: true,
    category: classification.category,
    description: classification.description,
  };
}
