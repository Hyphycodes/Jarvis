"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { buildExperienceTasteSignal } from "@/lib/radar/engine/tasteSignal";
import { upsertTasteReference } from "@/lib/taste/references";
import type { Json, PlanRow, SurfacedItemRow } from "@/lib/types/database";
import type { ExperienceRating } from "@/lib/radar/engine/tasteSignal";

export type { ExperienceRating } from "@/lib/radar/engine/tasteSignal";

export type ExperienceMemoryInput = {
  planId?: string | null;
  sourceItemId?: string | null;
  rating: ExperienceRating;
  wouldReturn?: boolean | null;
  companions?: string[] | null;
  spendAmount?: number | null;
  notes?: string | null;
  photoUrls?: string[] | null;
};

export type ExperienceMemory = {
  id: string;
  planId: string | null;
  sourceItemId: string | null;
  lane: string | null;
  venueName: string | null;
  rating: ExperienceRating;
  wouldReturn: boolean | null;
  companions: string[] | null;
  spendAmount: number | null;
  notes: string | null;
  photoUrls: string[] | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Pull the venue context the taste signal needs from the plan + source item. */
type ExperienceContext = {
  lane: string | null;
  venueName: string | null;
  neighborhood: string | null;
  subType: string | null;
  cuisine: string | null;
  tags: string[];
};

function contextFrom(plan: PlanRow | null, item: SurfacedItemRow | null): ExperienceContext {
  const keyStats = isRecord(plan?.key_stats) ? plan!.key_stats : {};
  const payload = isRecord(item?.payload) ? item!.payload : {};
  return {
    lane: str(item?.category) ?? str(keyStats.source_item_category) ?? null,
    venueName: str(item?.title) ?? str(plan?.title) ?? str(keyStats.location_name),
    neighborhood: str(item?.subtitle) ?? str(keyStats.neighborhood) ?? str(payload.neighborhood),
    subType: str(payload.sub_type),
    cuisine: str(payload.cuisine) ?? str(keyStats.cuisine_or_focus) ?? str(keyStats.cuisine),
    tags: Array.isArray(item?.tags) ? (item!.tags as string[]) : [],
  };
}

export async function recordExperienceMemory(
  input: ExperienceMemoryInput,
): Promise<{ ok: true; id: string }> {
  if (!input.planId && !input.sourceItemId) {
    throw new Error("planId or sourceItemId required.");
  }
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  // Gather context from the plan + its source item.
  let plan: PlanRow | null = null;
  if (input.planId) {
    const { data } = await supabase
      .from("plans")
      .select("*")
      .eq("id", input.planId)
      .eq("user_id", owner.id)
      .maybeSingle();
    plan = (data as PlanRow | null) ?? null;
  }
  const resolvedItemId =
    input.sourceItemId ??
    (isRecord(plan?.key_stats) && typeof plan!.key_stats.source_item_id === "string"
      ? (plan!.key_stats.source_item_id as string)
      : null);
  let item: SurfacedItemRow | null = null;
  if (resolvedItemId) {
    const { data } = await supabase
      .from("surfaced_items")
      .select("*")
      .eq("id", resolvedItemId)
      .eq("user_id", owner.id)
      .maybeSingle();
    item = (data as SurfacedItemRow | null) ?? null;
  }

  const ctx = contextFrom(plan, item);
  const tasteSignal = buildExperienceTasteSignal(input, ctx);

  const row = {
    user_id: owner.id,
    plan_id: input.planId ?? null,
    source_item_id: resolvedItemId,
    lane: ctx.lane,
    venue_name: ctx.venueName,
    rating: input.rating,
    would_return: input.wouldReturn ?? null,
    companions: input.companions ?? null,
    spend_amount: input.spendAmount ?? null,
    notes: input.notes ?? null,
    photo_urls: input.photoUrls ?? null,
    taste_signal: tasteSignal,
    updated_at: new Date().toISOString(),
  };

  // Upsert one memory per plan (preferred) or per source item. Manual select →
  // update/insert (partial unique indexes don't play well with ON CONFLICT).
  let existingId: string | null = null;
  if (input.planId) {
    const { data } = await supabase
      .from("experience_memories")
      .select("id")
      .eq("user_id", owner.id)
      .eq("plan_id", input.planId)
      .maybeSingle();
    existingId = (data as { id: string } | null)?.id ?? null;
  }
  if (!existingId && resolvedItemId) {
    const { data } = await supabase
      .from("experience_memories")
      .select("id")
      .eq("user_id", owner.id)
      .eq("source_item_id", resolvedItemId)
      .maybeSingle();
    existingId = (data as { id: string } | null)?.id ?? null;
  }

  let memoryId: string;
  if (existingId) {
    const { error } = await supabase
      .from("experience_memories")
      .update(row)
      .eq("id", existingId)
      .eq("user_id", owner.id);
    if (error) throw new Error(error.message);
    memoryId = existingId;
  } else {
    const { data, error } = await supabase
      .from("experience_memories")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    memoryId = (data as { id: string }).id;
  }

  // Lightweight "feedback recorded" flag — merge into key_stats/payload ONLY.
  // Never touch status/destination/build_status (guardrail: AFTER must not
  // mutate schedule/plan lifecycle).
  if (plan && input.planId) {
    const nextKeyStats = { ...(isRecord(plan.key_stats) ? plan.key_stats : {}), after_recorded: true };
    await supabase
      .from("plans")
      .update({ key_stats: nextKeyStats as Json })
      .eq("id", input.planId)
      .eq("user_id", owner.id);
  }
  if (item && resolvedItemId) {
    const nextPayload = { ...(isRecord(item.payload) ? item.payload : {}), after_recorded: true };
    await supabase
      .from("surfaced_items")
      .update({ payload: nextPayload as Json })
      .eq("id", resolvedItemId)
      .eq("user_id", owner.id);
  }

  // Done-loop → canon: every done-thing is the richest signal in the app.
  // Loved + would-return hardens into a YES reference; not-for-me becomes a
  // NO reference, so the councils can reject by comparison, not just approve.
  if (ctx.venueName) {
    const note = input.notes?.trim() || ctx.subType || ctx.cuisine || null;
    if (input.rating === "loved" && input.wouldReturn) {
      await upsertTasteReference({
        userId: owner.id,
        name: ctx.venueName,
        kind: "yes",
        lane: ctx.lane,
        note,
        source: "experience",
        strength: 0.85,
        supabase,
      });
    } else if (input.rating === "not_for_me") {
      await upsertTasteReference({
        userId: owner.id,
        name: ctx.venueName,
        kind: "no",
        lane: ctx.lane,
        note,
        source: "experience",
        strength: 0.8,
        supabase,
      });
    }
  }

  const slug =
    isRecord(plan?.key_stats) && typeof plan!.key_stats.slug === "string"
      ? (plan!.key_stats.slug as string)
      : null;
  if (slug) revalidatePath(`/plan/${slug}`);
  revalidatePath(`/`);

  return { ok: true, id: memoryId };
}

/** Read the existing memory for a plan/item (prefill the AFTER form). */
export async function getExperienceMemory(input: {
  planId?: string | null;
  sourceItemId?: string | null;
}): Promise<ExperienceMemory | null> {
  if (!input.planId && !input.sourceItemId) return null;
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  let query = supabase.from("experience_memories").select("*").eq("user_id", owner.id);
  query = input.planId
    ? query.eq("plan_id", input.planId)
    : query.eq("source_item_id", input.sourceItemId as string);
  const { data } = await query.maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    planId: (r.plan_id as string | null) ?? null,
    sourceItemId: (r.source_item_id as string | null) ?? null,
    lane: (r.lane as string | null) ?? null,
    venueName: (r.venue_name as string | null) ?? null,
    rating: r.rating as ExperienceRating,
    wouldReturn: (r.would_return as boolean | null) ?? null,
    companions: (r.companions as string[] | null) ?? null,
    spendAmount: (r.spend_amount as number | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    photoUrls: (r.photo_urls as string[] | null) ?? null,
  };
}
