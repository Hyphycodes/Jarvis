import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** Stage 6/7 context — Jerry's own AFTER feedback, fed back into curation so the
 *  shelf adapts to what he actually enjoyed. Kept compact (a handful of recent
 *  one-liners split loved vs not-for-me) so it never bloats the prompt. */

type MemoryRow = {
  venue_name: string | null;
  lane: string | null;
  rating: string;
  would_return: boolean | null;
  notes: string | null;
  taste_signal: Record<string, unknown> | null;
};

export type ExperienceContext = {
  loved: string[];
  avoided: string[];
  /** Ready-to-embed prompt block (empty string when there's nothing yet). */
  block: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function lineFor(row: MemoryRow): string {
  const sig = isRecord(row.taste_signal) ? row.taste_signal : {};
  const subType = typeof sig.sub_type === "string" ? sig.sub_type : null;
  const hood = typeof sig.neighborhood === "string" ? sig.neighborhood : null;
  const where = [subType, hood].filter(Boolean).join(", ");
  const note = row.notes ? `: "${row.notes.slice(0, 90)}"` : "";
  return `${row.venue_name ?? "a place"}${where ? ` (${where})` : ""}${note}`;
}

export async function getExperienceContext(input: {
  userId: string;
  lane?: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<ExperienceContext> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const limit = input.limit ?? 12;

  let query = supabase
    .from("experience_memories")
    .select("venue_name, lane, rating, would_return, notes, taste_signal")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (input.lane) query = query.eq("lane", input.lane);

  const { data, error } = await query;
  if (error || !data) return { loved: [], avoided: [], block: "" };

  const rows = data as MemoryRow[];
  const loved: string[] = [];
  const avoided: string[] = [];
  for (const row of rows) {
    const positive =
      (isRecord(row.taste_signal) && row.taste_signal.valence === "positive") ||
      row.rating === "loved" ||
      row.rating === "good";
    (positive ? loved : avoided).push(lineFor(row));
  }

  if (loved.length === 0 && avoided.length === 0) return { loved, avoided, block: "" };

  const parts: string[] = [
    "Jerry's own past experiences (his real feedback — weight this heavily over generic acclaim):",
  ];
  if (loved.length) parts.push(`Loved / would return: ${loved.slice(0, 8).join("; ")}`);
  if (avoided.length) parts.push(`Not for him: ${avoided.slice(0, 6).join("; ")}`);
  return { loved, avoided, block: parts.join("\n") };
}
