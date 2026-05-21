"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  createSessionContextSchema,
  type CreateSessionContextInput,
} from "@/lib/schemas";
import type { SessionContextRow } from "@/lib/types/database";

export async function listSessionContext(): Promise<SessionContextRow[]> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("session_context")
    .select("*")
    .eq("user_id", owner.id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SessionContextRow[];
}

export async function createSessionContext(input: CreateSessionContextInput) {
  const owner = await requireOwner();
  const data = createSessionContextSchema.parse(input);
  const expiresAt = new Date(
    Date.now() + data.expires_in_days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("session_context").insert({
    user_id: owner.id,
    content: data.content,
    kind: data.kind,
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

/**
 * Manual decay sweep. The real implementation is out of scope for this
 * sprint — a scheduled job will run this on a cron. Until then, call this
 * action on demand to garbage-collect.
 */
export async function clearExpiredSessionContext() {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("session_context")
    .delete()
    .eq("user_id", owner.id)
    .lt("expires_at", new Date().toISOString());
  if (error) throw new Error(error.message);
}
