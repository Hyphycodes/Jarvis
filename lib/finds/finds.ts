import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  researchProduct,
  classifyBrain,
  findIsReady,
  assessFindBudget,
  defaultFindBudgetMax,
  type ProductDossier,
  type SourceBrain,
} from "@/lib/brain/productResearcher";
import { buildClosetSummary } from "@/lib/wardrobe/closet";
import { readOperatingPreferences } from "@/lib/operating/readOperatingPreferences";
import { spendContextForResearcher } from "@/lib/operating/operatingPreferences";
import type { Json } from "@/lib/types/database";

export type FindSource = "user_intent" | "need_scout" | "finds";

/**
 * Research a single "find" (something to buy/source/upgrade) via the Product
 * Researcher and surface it as a Finds Radar card. User-requested finds outrank
 * background (Need Scout) finds. Idempotent by mission title.
 *
 * Surfacing gate: a find is only presented as a real buyer recommendation when
 * its dossier is `ready` (real title/price/image/url/retailer/decision). A
 * not-ready find is still stored (so the background job can retry enrichment)
 * but rendered in a quiet "researching" state — never as a fabricated pick.
 */
export async function createFind(input: {
  userId: string;
  mission: string;
  context?: string;
  source?: FindSource;
  sourceBrain?: SourceBrain;
  refine?: string;
  supabase?: SupabaseClient;
}): Promise<{ itemId: string | null; dossier: ProductDossier }> {
  const sb = input.supabase ?? getSupabaseServiceClient();
  const source = input.source ?? "finds";
  const brain = input.sourceBrain ?? classifyBrain(input.mission, input.context);

  // Closet-aware context for style finds: avoid duplicates, fill real gaps.
  let context = input.context;
  if (brain === "style") {
    const closet = await buildClosetSummary(input.userId, sb).catch(() => null);
    if (closet) {
      context = [context, `His closet right now (buy to fill gaps / upgrade repeats, not duplicate):\n${closet}`]
        .filter(Boolean)
        .join("\n\n");
    }
  }

  const prefs = await readOperatingPreferences(sb, input.userId);
  const dossier = await researchProduct({
    mission: input.mission,
    context,
    refine: input.refine,
    sourceBrain: brain,
    budgetMax: defaultFindBudgetMax(brain, input.mission, source),
    spend: spendContextForResearcher(prefs),
  });

  // Never surface an empty, unresearched shell with nothing to show.
  if (!dossier.best_pick && dossier.research_state !== "ready") {
    // Still return so the caller/job can persist a researching stub if it wants.
    return { itemId: await upsertFind(sb, input.userId, dossier, source), dossier };
  }

  const itemId = await upsertFind(sb, input.userId, dossier, source);
  return { itemId, dossier };
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
    .select("payload, source")
    .eq("id", input.itemId)
    .eq("user_id", input.userId)
    .maybeSingle();
  const payload = (data as { payload?: unknown } | null)?.payload;
  const prior = isRecord(payload) && isRecord(payload.finds) ? (payload.finds as ProductDossier) : null;
  if (!prior) return { ok: false };
  const source = (isRecord(payload) && typeof payload.source === "string" ? payload.source : "finds") as FindSource;

  const prefs = await readOperatingPreferences(sb, input.userId);
  const dossier = await researchProduct({
    mission: prior.mission_title,
    context: prior.why_surfaced,
    refine: input.refine,
    sourceBrain: prior.source_brain,
    budgetMax: defaultFindBudgetMax(prior.source_brain, prior.mission_title, source),
    spend: spendContextForResearcher(prefs),
  });
  const row = buildFindRow(input.userId, dossier, source);
  await sb.from("surfaced_items").update({ ...row, updated_at: new Date().toISOString() }).eq("id", input.itemId).eq("user_id", input.userId);
  return { ok: true, dossier };
}

async function upsertFind(
  sb: SupabaseClient,
  userId: string,
  dossier: ProductDossier,
  source: FindSource,
): Promise<string | null> {
  const { data: existing } = await sb
    .from("surfaced_items")
    .select("id")
    .eq("user_id", userId)
    .eq("category", "finds")
    .ilike("title", dossier.mission_title)
    .not("status", "in", "(archived,passed)")
    .order("updated_at", { ascending: false })
    .limit(1);
  const existingId = ((existing ?? []) as Array<{ id: string }>)[0]?.id;

  const row = buildFindRow(userId, dossier, source);
  if (existingId) {
    await sb.from("surfaced_items").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existingId).eq("user_id", userId);
    return existingId;
  }
  const { data, error } = await sb.from("surfaced_items").insert(row).select("id").single();
  if (error) {
    console.error("[finds] insert failed", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

function buildFindRow(userId: string, dossier: ProductDossier, source: FindSource): Record<string, unknown> {
  const pick = dossier.best_pick;
  const ready = findIsReady(dossier);
  const budget = assessFindBudget(dossier);
  const userRequested = source === "user_intent";
  // User asks lead the Finds feed; background finds stay useful but quieter.
  // Not-ready finds rank low until enriched.
  const base = userRequested ? Math.max(dossier.verdict_strength, 0.9) : Math.min(dossier.verdict_strength, 0.82);
  const budgetAdjusted = Math.max(0, base - budget.aspirational_penalty);
  const score = ready ? budgetAdjusted : Math.min(budgetAdjusted, 0.35);
  const destination = userRequested && ready ? "radar" : "holding";
  const status = userRequested && ready ? "shown" : "discovered";

  return {
    user_id: userId,
    destination,
    status,
    source,
    type: "finds",
    category: "finds",
    title: dossier.mission_title,
    subtitle: pick?.price ?? null,
    description: ready && pick ? `${pick.name}${pick.taste_fit ? ` — ${pick.taste_fit}` : ""}` : dossier.why_surfaced,
    url: pick?.product_url ?? null,
    image_url: pick?.image_url ?? null,
    score,
    reasons: [dossier.why_surfaced].filter(Boolean),
    tags: ["finds", dossier.source_brain],
    planning_state: "saved_to_radar",
    payload: {
      finds: { ...dossier, ...budget },
      source,
      source_brain: dossier.source_brain,
      budget_tier: budget.budget_tier,
      budget_fit: budget.budget_fit,
      value_for_income: budget.value_for_income,
      cost_per_use: budget.cost_per_use,
      realistic_purchase_timing: budget.realistic_purchase_timing,
      aspirational_penalty: budget.aspirational_penalty,
      quality_without_flash: budget.quality_without_flash,
      ...(budget.budget_tier === "aspirational" || budget.budget_tier === "hold"
        ? { budget_guardrail: "Background luxury is held unless the owner explicitly asks for it." }
        : {}),
    } as unknown as Json,
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
