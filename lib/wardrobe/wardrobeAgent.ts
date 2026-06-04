import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export type WardrobeContext = {
  ownedPieces: Array<{
    category: string;
    color: string | null;
    formality: string | null;
    description: string;
    activityTags: string[];
  }>;
  gaps: string[]; // categories with no appropriate owned item
  summary: string; // one-line summary for the plan LLM
};

export async function queryWardrobeForEvent(input: {
  userId: string;
  formality: "casual" | "smart-casual" | "business" | "formal";
  activityTag?: string; // e.g. "dining", "outdoor", "golf"
  season?: string; // e.g. "summer"
}): Promise<WardrobeContext> {
  const supabase = getSupabaseServiceClient();

  // Query items matching formality and activity tag.
  let query = supabase
    .from("wardrobe_items")
    .select("category, color, secondary_color, formality, description, activity_tags, season")
    .eq("user_id", input.userId)
    .neq("condition", "retired");

  if (input.formality) {
    // Include exact match and one level up/down.
    const formalityRange = formalityGroup(input.formality);
    query = query.in("formality", formalityRange);
  }

  const { data } = await query.limit(50);
  const items = (data ?? []) as Array<{
    category: string;
    color: string | null;
    secondary_color: string | null;
    formality: string | null;
    description: string;
    activity_tags: string[];
    season: string[];
  }>;

  // Filter by activity tag if provided.
  const filtered = input.activityTag
    ? items.filter(
        (item) =>
          item.activity_tags.includes(input.activityTag!) ||
          item.activity_tags.includes("casual"), // casual works for most
      )
    : items;

  // Filter by season if provided.
  const seasonal = input.season
    ? filtered.filter(
        (item) =>
          item.season.length === 0 || // no season restriction
          item.season.includes(input.season!),
      )
    : filtered;

  const ownedPieces = seasonal.map((item) => ({
    category: item.category,
    color: item.color,
    formality: item.formality,
    description: item.description,
    activityTags: item.activity_tags,
  }));

  // Detect gaps (categories with nothing owned that fits).
  const ESSENTIAL_CATEGORIES = ["tops", "bottoms", "shoes"];
  const ownedCategories = new Set(ownedPieces.map((p) => p.category));
  const gaps = ESSENTIAL_CATEGORIES.filter((c) => !ownedCategories.has(c));

  const summary =
    ownedPieces.length === 0
      ? "No wardrobe data yet — outfit suggestion is from taste profile only."
      : `${ownedPieces.length} items in wardrobe fit this occasion. ${
          gaps.length > 0
            ? `Gaps: ${gaps.join(", ")}.`
            : "Full outfit available from wardrobe."
        }`;

  return { ownedPieces, gaps, summary };
}

function formalityGroup(formality: string): string[] {
  // Allow one step of flexibility in either direction.
  const levels = ["casual", "smart-casual", "business", "formal"];
  const idx = levels.indexOf(formality);
  if (idx === -1) return [formality];
  return levels.slice(Math.max(0, idx - 1), Math.min(levels.length, idx + 2));
}
