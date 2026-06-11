import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getTasteCanon } from "@/lib/taste/references";

/** Stage 6/7 context — the reference canon (named YES/NO anchor points) plus
 *  Jerry's own AFTER feedback, fed back into curation so judgments are made by
 *  comparison instead of in a vacuum. Kept compact so it never bloats the
 *  prompt. Every lane council receives this block. */

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

/**
 * North as the hand on the scale: a deterministic one-liner from real pillar
 * progress. Cold pillars tilt judgment toward what feeds them; Peace is the
 * north star (default posture: protect, subtract, stay quiet). Never surfaces
 * as its own items — only weights.
 */
async function northReadLine(
  userId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("north_pillars")
      .select("title, progress")
      .eq("user_id", userId);
    const pillars = (data ?? []) as Array<{ title: string; progress: number | null }>;
    if (pillars.length === 0) return null;
    const cold = pillars
      .filter((p) => typeof p.progress === "number" && p.progress < 0.3)
      .map((p) => p.title);
    const active = pillars
      .filter((p) => typeof p.progress === "number" && p.progress > 0.7)
      .map((p) => p.title);
    if (cold.length === 0 && active.length === 0) return null;
    const parts: string[] = ["North read (silent weighting):"];
    if (cold.length) parts.push(`${cold.join(", ")} ${cold.length === 1 ? "is" : "are"} cold — tilt toward what feeds ${cold.length === 1 ? "it" : "them"}.`);
    if (active.length) parts.push(`${active.join(", ")} ${active.length === 1 ? "is" : "are"} active — range can widen there.`);
    parts.push("When in doubt, protect Peace: subtract, stay quiet.");
    return parts.join(" ");
  } catch {
    return null;
  }
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

  const [{ data, error }, canon, northRead] = await Promise.all([
    query,
    getTasteCanon({ userId: input.userId, lane: input.lane, supabase }),
    northReadLine(input.userId, supabase),
  ]);
  const baseBlock = [canon.block, northRead].filter(Boolean).join("\n");
  if (error || !data) return { loved: [], avoided: [], block: baseBlock };

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

  if (loved.length === 0 && avoided.length === 0) {
    return { loved, avoided, block: baseBlock };
  }

  const parts: string[] = [];
  if (baseBlock) parts.push(baseBlock, "");
  parts.push(
    "Jerry's own past experiences (his real feedback — weight this heavily over generic acclaim):",
  );
  if (loved.length) parts.push(`Loved / would return: ${loved.slice(0, 8).join("; ")}`);
  if (avoided.length) parts.push(`Not for him: ${avoided.slice(0, 6).join("; ")}`);
  return { loved, avoided, block: parts.join("\n") };
}
