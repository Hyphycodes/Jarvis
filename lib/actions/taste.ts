"use server";

import { revalidatePath } from "next/cache";
import { getViewableProfileId, requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  adjustSignalWeightSchema,
  createTasteSignalSchema,
  idOnlySchema,
  updateTasteSignalSchema,
  type AdjustSignalWeightInput,
  type CreateTasteSignalInput,
  type UpdateTasteSignalInput,
} from "@/lib/schemas";
import type { TasteSignalRow } from "@/lib/types/database";

export async function listTasteSignals(): Promise<TasteSignalRow[]> {
  const { id } = await getViewableProfileId();
  if (!id) return [];
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("taste_signals")
    .select("*")
    .eq("user_id", id)
    .order("direction", { ascending: true })
    .order("weight", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TasteSignalRow[];
}

export async function createTasteSignal(input: CreateTasteSignalInput) {
  const owner = await requireOwner();
  const data = createTasteSignalSchema.parse(input);
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("taste_signals").insert({
    user_id: owner.id,
    trait: data.trait,
    direction: data.direction,
    category: data.category ?? null,
    weight: data.weight,
    confidence: data.confidence,
    source: data.source ?? "manual",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

export async function updateTasteSignal(input: UpdateTasteSignalInput) {
  const owner = await requireOwner();
  const data = updateTasteSignalSchema.parse(input);
  const { id, ...patch } = data;
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("taste_signals")
    .update(patch)
    .eq("id", id)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

export async function deleteTasteSignal(input: { id: string }) {
  const owner = await requireOwner();
  const { id } = idOnlySchema.parse(input);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("taste_signals")
    .delete()
    .eq("id", id)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

export async function adjustSignalWeight(input: AdjustSignalWeightInput) {
  const owner = await requireOwner();
  const { id, delta } = adjustSignalWeightSchema.parse(input);
  const supabase = await getServerSupabase();
  const { data: current, error: readErr } = await supabase
    .from("taste_signals")
    .select("weight, frequency")
    .eq("id", id)
    .eq("user_id", owner.id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!current) throw new Error("Signal not found");
  const nextWeight = Math.max(0, Number(current.weight) + delta);
  const nextFrequency = (current.frequency ?? 1) + 1;
  const { error } = await supabase
    .from("taste_signals")
    .update({
      weight: nextWeight,
      frequency: nextFrequency,
      last_reinforced_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}
