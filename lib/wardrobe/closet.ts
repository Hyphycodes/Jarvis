import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { WARDROBE_CATEGORIES, type WardrobeCategory } from "@/lib/wardrobe/analyzeGarments";

export type ClosetItem = {
  id: string;
  category: WardrobeCategory;
  color: string | null;
  secondary_color: string | null;
  pattern: string | null;
  material: string | null;
  brand: string | null;
  formality: string | null;
  season: string[];
  fit_silhouette: string | null;
  condition: string | null;
  style_notes: string | null;
  description: string;
  times_seen: number;
  needs_clarification: boolean;
};

export type Clarification = {
  id: string;
  wardrobe_item_id: string | null;
  question: string;
  kind: string;
  options: string[];
  item_label: string | null;
};

export type Closet = {
  total: number;
  items: ClosetItem[];
  byCategory: Record<WardrobeCategory, ClosetItem[]>;
  counts: Record<WardrobeCategory, number>;
  frequentlyWorn: ClosetItem[];
  gaps: string[];
  clarifications: Clarification[];
};

/** Floors per category — below this we flag a gap. */
const CATEGORY_FLOOR: Record<WardrobeCategory, number> = {
  tops: 6,
  bottoms: 4,
  outerwear: 2,
  shoes: 3,
  accessories: 2,
  headwear: 0,
};

export async function loadCloset(userId: string, supabase?: SupabaseClient): Promise<Closet> {
  const sb = supabase ?? getSupabaseServiceClient();
  const { data } = await sb
    .from("wardrobe_items")
    .select("id,category,color,secondary_color,pattern,material,brand,formality,season,fit_silhouette,condition,style_notes,description,times_seen,needs_clarification")
    .eq("user_id", userId)
    .neq("condition", "retired")
    .order("times_seen", { ascending: false })
    .order("created_at", { ascending: false });

  const items = ((data ?? []) as Array<Record<string, unknown>>).map(toItem);

  const byCategory = {} as Record<WardrobeCategory, ClosetItem[]>;
  const counts = {} as Record<WardrobeCategory, number>;
  for (const cat of WARDROBE_CATEGORIES) {
    byCategory[cat] = [];
    counts[cat] = 0;
  }
  for (const item of items) {
    byCategory[item.category].push(item);
    counts[item.category] += 1;
  }

  const frequentlyWorn = items.filter((i) => i.times_seen >= 3).slice(0, 8);

  const { data: clarData } = await sb
    .from("wardrobe_clarifications")
    .select("id,wardrobe_item_id,question,kind,options")
    .eq("user_id", userId)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(40);
  const labelById = new Map(items.map((i) => [i.id, i.description]));
  const clarifications: Clarification[] = ((clarData ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: String(c.id),
    wardrobe_item_id: (c.wardrobe_item_id as string | null) ?? null,
    question: String(c.question),
    kind: String(c.kind ?? "detail"),
    options: Array.isArray(c.options) ? (c.options as string[]) : [],
    item_label: c.wardrobe_item_id ? labelById.get(String(c.wardrobe_item_id)) ?? null : null,
  }));

  return {
    total: items.length,
    items,
    byCategory,
    counts,
    frequentlyWorn,
    gaps: computeGaps(byCategory, counts),
    clarifications,
  };
}

/** Wardrobe gaps — what's thin or missing. Feeds the Style brain now and the
 *  Finds filter later (Finds = what to buy next). Pure given the grouped closet. */
export function computeGaps(
  byCategory: Record<WardrobeCategory, ClosetItem[]>,
  counts: Record<WardrobeCategory, number>,
): string[] {
  const gaps: string[] = [];
  for (const cat of WARDROBE_CATEGORIES) {
    if (counts[cat] < CATEGORY_FLOOR[cat]) {
      gaps.push(counts[cat] === 0 ? `no ${cat} yet` : `more ${cat}`);
    }
  }
  // Shoes skew: lots of sneakers, nothing elevated.
  const shoes = byCategory.shoes;
  if (shoes.length >= 2) {
    const blob = shoes.map((s) => `${s.description} ${s.style_notes ?? ""}`.toLowerCase()).join(" ");
    const elevated = /(loafer|boot|derby|oxford|dress shoe|monk)/.test(blob);
    if (!elevated) gaps.push("elevated shoes (loafers/boots)");
  }
  // Linen for warm weather.
  const tops = byCategory.tops;
  const linen = tops.some((t) => /linen/.test(`${t.material ?? ""}`.toLowerCase()));
  if (tops.length >= 4 && !linen) gaps.push("linen pieces for summer");
  return gaps;
}

/** Compact closet brief for the Style brain's context. */
export async function buildClosetSummary(userId: string, supabase?: SupabaseClient): Promise<string | null> {
  const closet = await loadCloset(userId, supabase);
  if (closet.total === 0) return null;
  const parts: string[] = [];
  for (const cat of WARDROBE_CATEGORIES) {
    if (closet.counts[cat] > 0) parts.push(`${closet.counts[cat]} ${cat}`);
  }
  const often = closet.frequentlyWorn
    .slice(0, 5)
    .map((i) => `${i.description}${i.times_seen >= 3 ? ` (worn ${i.times_seen}×)` : ""}`)
    .join("; ");
  const lines = [`Owns: ${parts.join(", ")}.`];
  if (often) lines.push(`Wears often: ${often}.`);
  if (closet.gaps.length) lines.push(`Gaps: ${closet.gaps.join(", ")}.`);
  return lines.join(" ");
}

function toItem(row: Record<string, unknown>): ClosetItem {
  return {
    id: String(row.id),
    category: normalizeCat(row.category),
    color: str(row.color),
    secondary_color: str(row.secondary_color),
    pattern: str(row.pattern),
    material: str(row.material),
    brand: str(row.brand),
    formality: str(row.formality),
    season: Array.isArray(row.season) ? (row.season as string[]) : [],
    fit_silhouette: str(row.fit_silhouette),
    condition: str(row.condition),
    style_notes: str(row.style_notes),
    description: str(row.description) ?? "Item",
    times_seen: typeof row.times_seen === "number" ? row.times_seen : 1,
    needs_clarification: row.needs_clarification === true,
  };
}

function normalizeCat(value: unknown): WardrobeCategory {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  return (WARDROBE_CATEGORIES as readonly string[]).includes(raw) ? (raw as WardrobeCategory) : "accessories";
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
