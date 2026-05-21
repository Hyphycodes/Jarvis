"use server";

import { revalidatePath } from "next/cache";
import { getViewableProfileId, requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  createMemoryItemSchema,
  idOnlySchema,
  pinMemoryItemSchema,
  updateMemoryItemSchema,
  type CreateMemoryItemInput,
  type UpdateMemoryItemInput,
} from "@/lib/schemas";
import type { MemoryItemRow } from "@/lib/types/database";

export async function listMemoryItems(): Promise<MemoryItemRow[]> {
  const { id } = await getViewableProfileId();
  if (!id) return [];
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("memory_items")
    .select("*")
    .eq("user_id", id)
    .neq("status", "archived")
    .order("is_pinned", { ascending: false })
    .order("confidence", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MemoryItemRow[];
}

export async function createMemoryItem(input: CreateMemoryItemInput) {
  const owner = await requireOwner();
  const data = createMemoryItemSchema.parse(input);
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("memory_items").insert({
    user_id: owner.id,
    content: data.content,
    kind: data.kind,
    confidence: data.confidence,
    is_pinned: data.is_pinned,
    source: data.source ?? "manual",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

export async function updateMemoryItem(input: UpdateMemoryItemInput) {
  const owner = await requireOwner();
  const data = updateMemoryItemSchema.parse(input);
  const { id, ...patch } = data;
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("memory_items")
    .update(patch)
    .eq("id", id)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

export async function archiveMemoryItem(input: { id: string }) {
  const owner = await requireOwner();
  const { id } = idOnlySchema.parse(input);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("memory_items")
    .update({ status: "archived" })
    .eq("id", id)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

export async function deleteMemoryItem(input: { id: string }) {
  const owner = await requireOwner();
  const { id } = idOnlySchema.parse(input);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("memory_items")
    .delete()
    .eq("id", id)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

export async function pinMemoryItem(input: { id: string; pinned: boolean }) {
  const owner = await requireOwner();
  const { id, pinned } = pinMemoryItemSchema.parse(input);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("memory_items")
    .update({ is_pinned: pinned })
    .eq("id", id)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}
