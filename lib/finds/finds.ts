import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { researchProduct, type ProductDossier } from "@/lib/brain/productResearcher";
import type { Json } from "@/lib/types/database";

export type FindSource = "user_intent" | "need_scout" | "finds";

const MIN_SURFACE_STRENGTH = 0.3;

/**
 * Research a single "find" (something to buy/source/upgrade) via the Product
 * Researcher and surface it as a Finds Radar card. User-requested finds outrank
 * background (Need Scout) finds. Idempotent by mission title.
 */
export async function createFind(input: {
  userId: string;
  mission: string;
  context?: string;
  source?: FindSource;
  refine?: string;
  supabase?: SupabaseClient;
}): Promise<{ itemId: string | null; dossier: ProductDossier }> {
  const sb = input.supabase ?? getSupabaseServiceClient();
  const source = input.source ?? "finds";
  const dossier = await researchProduct({ mission: input.mission, context: input.context, refine: input.refine });

  // Don't surface weak, unresearched junk.
  if (!dossier.best_pick && dossier.verdict_strength < MIN_SURFACE_STRENGTH) {
    return { itemId: null, dossier };
  }

  const userRequested = source === "user_intent";
  // User asks lead the Finds feed; background finds stay useful but quieter.
  const score = userRequested
    ? Math.max(dossier.verdict_strength, 0.9)
    : Math.min(dossier.verdict_strength, 0.82);

  const { data: existing } = await sb
    .from("surfaced_items")
    .select("id")
    .eq("user_id", input.userId)
    .eq("category", "finds")
    .ilike("title", dossier.mission_title)
    .not("status", "in", "(archived,passed)")
    .order("updated_at", { ascending: false })
    .limit(1);
  const existingId = ((existing ?? []) as Array<{ id: string }>)[0]?.id;

  const row = buildFindRow(input.userId, dossier, source, score);
  if (existingId) {
    await sb.from("surfaced_items").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existingId).eq("user_id", input.userId);
    return { itemId: existingId, dossier };
  }
  const { data, error } = await sb.from("surfaced_items").insert(row).select("id").single();
  if (error) {
    console.error("[finds] insert failed", error.message);
    return { itemId: null, dossier };
  }
  return { itemId: (data as { id: string }).id, dossier };
}

/** Refine an existing find ("darker", "under $300", "more old-school") and
 *  rerank in place — never start over. */
export async function refineFind(input: {
  userId: string;
  itemId: string;
  refine: string;
  supabase?: SupabaseClient;
}): Promise<{ ok: boolean; dossier?: ProductDossier }> {
  const sb = input.supabase ?? getSupabaseServiceClient();
  const { data } = await sb
    .from("surfaced_items")
    .select("payload, source, score")
    .eq("id", input.itemId)
    .eq("user_id", input.userId)
    .maybeSingle();
  const payload = (data as { payload?: unknown } | null)?.payload;
  const prior = isRecord(payload) && isRecord(payload.finds) ? (payload.finds as ProductDossier) : null;
  if (!prior) return { ok: false };

  const dossier = await researchProduct({
    mission: prior.mission_title,
    context: prior.why_surfaced,
    refine: input.refine,
  });
  const source = (isRecord(payload) && typeof payload.source === "string" ? payload.source : "finds") as FindSource;
  const score = source === "user_intent" ? Math.max(dossier.verdict_strength, 0.9) : Math.min(dossier.verdict_strength, 0.82);
  const row = buildFindRow(input.userId, dossier, source, score);
  await sb.from("surfaced_items").update({ ...row, updated_at: new Date().toISOString() }).eq("id", input.itemId).eq("user_id", input.userId);
  return { ok: true, dossier };
}

function buildFindRow(userId: string, dossier: ProductDossier, source: FindSource, score: number): Record<string, unknown> {
  const pick = dossier.best_pick;
  return {
    user_id: userId,
    destination: "radar",
    status: "shown",
    source,
    type: "finds",
    category: "finds",
    title: dossier.mission_title,
    subtitle: pick?.price ?? null,
    description: pick ? `${pick.name}${pick.taste_fit ? ` — ${pick.taste_fit}` : ""}` : dossier.why_surfaced,
    url: pick?.url ?? pick?.where_to_buy ?? null,
    score,
    reasons: [dossier.why_surfaced].filter(Boolean),
    tags: ["finds"],
    planning_state: "saved_to_radar",
    payload: { finds: dossier, source } as unknown as Json,
  };
}

/** Titles of finds already on the board — so Need Scout doesn't repeat them. */
export async function existingFindMissions(userId: string, supabase?: SupabaseClient): Promise<string[]> {
  const sb = supabase ?? getSupabaseServiceClient();
  const { data } = await sb
    .from("surfaced_items")
    .select("title, status")
    .eq("user_id", userId)
    .eq("category", "finds")
    .order("updated_at", { ascending: false })
    .limit(60);
  return ((data ?? []) as Array<{ title: string | null }>).map((r) => r.title ?? "").filter(Boolean);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
