import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { analyzeGarments, type GarmentExtraction } from "@/lib/wardrobe/analyzeGarments";

export type WardrobeIntakeSummary = {
  photos: number;
  created: number;
  merged: number;
  skipped: number;
  clarifications: number;
  items: Array<{ id: string; name: string; category: string; merged: boolean }>;
};

type ExistingRow = {
  id: string;
  category: string;
  color: string | null;
  secondary_color: string | null;
  brand: string | null;
  material: string | null;
  pattern: string | null;
  fit_silhouette: string | null;
  style_notes: string | null;
  description: string | null;
  dedup_key: string | null;
  times_seen: number | null;
  photos: unknown;
};

/**
 * Ingest one or more wardrobe photos: extract every garment, dedupe against the
 * existing closet (the same piece across photos becomes one item with
 * times_seen++), fill missing fields, and raise clarification prompts when
 * unsure. Honors a free-text context note ("most are Zara", "ignore the floor").
 */
export async function ingestWardrobePhotos(input: {
  userId: string;
  photos: Array<{ base64: string; mediaType?: string }>;
  contextNote?: string;
  supabase?: SupabaseClient;
}): Promise<WardrobeIntakeSummary> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const summary: WardrobeIntakeSummary = {
    photos: 0,
    created: 0,
    merged: 0,
    skipped: 0,
    clarifications: 0,
    items: [],
  };

  const { data: existingData } = await supabase
    .from("wardrobe_items")
    .select("id,category,color,secondary_color,brand,material,pattern,fit_silhouette,style_notes,description,dedup_key,times_seen,photos")
    .eq("user_id", input.userId)
    .neq("condition", "retired");
  const byKey = new Map<string, ExistingRow>();
  for (const row of (existingData ?? []) as ExistingRow[]) {
    if (row.dedup_key) byKey.set(row.dedup_key, row);
  }

  for (const photo of input.photos) {
    if (!photo.base64) continue;
    summary.photos++;
    const garments = await analyzeGarments({
      imageBase64: photo.base64,
      mediaType: photo.mediaType,
      contextNote: input.contextNote,
    });
    if (garments.length === 0) summary.skipped++;

    for (const g of garments) {
      const key = dedupKey(g);
      const match = byKey.get(key);
      const now = new Date().toISOString();

      if (match) {
        // Same garment seen again — bump wear signal, fill gaps, attach photo.
        const patch: Record<string, unknown> = {
          times_seen: (match.times_seen ?? 1) + 1,
          last_seen: now,
          updated_at: now,
        };
        if (!match.color && g.color) patch.color = g.color;
        if (!match.material && g.material) patch.material = g.material;
        if (!match.brand && g.brand) patch.brand = g.brand;
        if (!match.pattern && g.pattern) patch.pattern = g.pattern;
        if (!match.fit_silhouette && g.fit_silhouette) patch.fit_silhouette = g.fit_silhouette;
        if (!match.style_notes && g.style_notes) patch.style_notes = g.style_notes;
        await supabase.from("wardrobe_items").update(patch).eq("id", match.id).eq("user_id", input.userId);
        match.times_seen = (match.times_seen ?? 1) + 1;
        summary.merged++;
        summary.items.push({ id: match.id, name: g.name, category: g.category, merged: true });
        continue;
      }

      const id = crypto.randomUUID();
      const needsClar = g.confidence < 0.55 || isAmbiguousColor(g);
      const { error } = await supabase.from("wardrobe_items").insert({
        id,
        user_id: input.userId,
        photo_url: `wardrobe:${id}`,
        category: g.category,
        color: g.color,
        secondary_color: g.secondary_color,
        pattern: g.pattern,
        material: g.material,
        brand: g.brand,
        source: g.brand,
        formality: g.formality,
        season: g.season,
        activity_tags: deriveActivityTags(g),
        fit_silhouette: g.fit_silhouette,
        style_notes: g.style_notes,
        description: g.style_notes ? `${g.name} — ${g.style_notes}` : g.name,
        condition: g.condition ?? "good",
        confidence: g.confidence,
        times_seen: 1,
        last_seen: now,
        dedup_key: key,
        needs_clarification: needsClar,
      });
      if (error) {
        console.error("[wardrobe/intake] insert failed", error.message);
        summary.skipped++;
        continue;
      }
      byKey.set(key, {
        id,
        category: g.category,
        color: g.color,
        secondary_color: g.secondary_color,
        brand: g.brand,
        material: g.material,
        pattern: g.pattern,
        fit_silhouette: g.fit_silhouette,
        style_notes: g.style_notes,
        description: g.name,
        dedup_key: key,
        times_seen: 1,
        photos: [],
      });
      summary.created++;
      summary.items.push({ id, name: g.name, category: g.category, merged: false });

      const made = await createClarifications(supabase, input.userId, id, g);
      summary.clarifications += made;
    }
  }

  return summary;
}

/** Back-compat single-photo entry point (chat side-effect / legacy callers). */
export async function ingestWardrobePhoto(input: {
  userId: string;
  imageBase64: string;
  mediaType?: string;
  contextNote?: string;
}): Promise<{ stored: boolean; category?: string; description?: string; reason?: string }> {
  const summary = await ingestWardrobePhotos({
    userId: input.userId,
    photos: [{ base64: input.imageBase64, mediaType: input.mediaType }],
    contextNote: input.contextNote,
  });
  const first = summary.items[0];
  if (!first) return { stored: false, reason: "No garments detected" };
  return { stored: true, category: first.category, description: first.name };
}

async function createClarifications(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  g: GarmentExtraction,
): Promise<number> {
  const rows: Array<{ question: string; kind: string; options: string[] }> = [];
  if (isAmbiguousColor(g) && g.color) {
    rows.push({
      question: `Is this ${g.color} or ${nearestColor(g.color)}?`,
      kind: "color",
      options: [g.color, nearestColor(g.color)],
    });
  }
  if (g.confidence < 0.45) {
    rows.push({ question: `Is this yours? (${g.name})`, kind: "ownership", options: ["Yes", "No"] });
  }
  if (!g.material && (g.category === "tops" || g.category === "outerwear" || g.category === "bottoms")) {
    rows.push({ question: `What material is the ${g.name}?`, kind: "material", options: [] });
  }
  if (rows.length === 0) return 0;
  const now = new Date().toISOString();
  const { error } = await supabase.from("wardrobe_clarifications").insert(
    rows.map((r) => ({
      user_id: userId,
      wardrobe_item_id: itemId,
      question: r.question,
      kind: r.kind,
      options: r.options,
      status: "open",
      created_at: now,
      updated_at: now,
    })),
  );
  if (error) {
    console.error("[wardrobe/intake] clarification insert failed", error.message);
    return 0;
  }
  return rows.length;
}

// ── Dedup signature ─────────────────────────────────────────────────────────
function dedupKey(g: GarmentExtraction): string {
  return [g.category, garmentKind(g), normColor(g.color), g.pattern ?? "solid", (g.brand ?? "").toLowerCase()]
    .map((p) => `${p}`.toLowerCase().replace(/\s+/g, "-"))
    .join("|");
}

const KIND_PATTERNS: Array<[RegExp, string]> = [
  [/hoodie|sweatshirt/, "hoodie"],
  [/t-?shirt|\btee\b/, "tee"],
  [/polo/, "polo"],
  [/sweater|knit|cardigan/, "sweater"],
  [/overshirt|shacket/, "overshirt"],
  [/button|oxford|\bshirt\b/, "shirt"],
  [/blazer/, "blazer"],
  [/\bjacket\b|parka|coat/, "jacket"],
  [/jean|denim/, "jeans"],
  [/chino|trouser|\bpant/, "pants"],
  [/short/, "shorts"],
  [/sneaker|trainer/, "sneakers"],
  [/loafer/, "loafers"],
  [/boot/, "boots"],
  [/sandal|slide/, "sandals"],
  [/\bcap\b|hat|beanie/, "headwear"],
  [/belt/, "belt"],
  [/watch/, "watch"],
];

function garmentKind(g: GarmentExtraction): string {
  const hay = `${g.name}`.toLowerCase();
  for (const [re, kind] of KIND_PATTERNS) if (re.test(hay)) return kind;
  return g.category;
}

function normColor(color: string | null): string {
  const c = (color ?? "unknown").toLowerCase().trim();
  if (/^(grey|gray)$/.test(c)) return "grey";
  return c;
}

const AMBIGUOUS = new Set(["black", "navy", "charcoal", "brown", "olive", "grey", "gray", "dark"]);
function isAmbiguousColor(g: GarmentExtraction): boolean {
  return g.confidence < 0.7 && AMBIGUOUS.has((g.color ?? "").toLowerCase());
}
function nearestColor(color: string): string {
  const c = color.toLowerCase();
  if (c === "black") return "navy";
  if (c === "navy") return "black";
  if (c === "charcoal") return "grey";
  if (c === "grey" || c === "gray") return "charcoal";
  if (c === "brown") return "olive";
  if (c === "olive") return "brown";
  return "another shade";
}

function deriveActivityTags(g: GarmentExtraction): string[] {
  const tags = new Set<string>();
  const f = (g.formality ?? "").toLowerCase();
  if (f.includes("athletic")) tags.add("workout");
  else if (f.includes("formal")) tags.add("evening");
  else if (f.includes("smart")) tags.add("smart-casual");
  else tags.add("everyday");
  for (const s of g.season) tags.add(s);
  return Array.from(tags).slice(0, 4);
}
