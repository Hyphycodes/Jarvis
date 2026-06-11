import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * The taste reference canon — named anchor points the curation engine judges
 * against, instead of scoring in a vacuum. YES references are the bar (what
 * "right" looks like); NO references are auto-reject energy. Judging by
 * comparison to a canon is what keeps scores honest: "this is the Costera of
 * steak" is a verdict, "this feels giving Tao" is a kill.
 *
 * Sources: taste seed import, the AFTER done-loop (loved → yes, not-for-me →
 * no), the mic ("never put me in a place like X"), and manual edits.
 */

export type TasteReference = {
  id: string;
  name: string;
  lane: string | null;
  kind: "yes" | "no";
  note: string | null;
  source: string;
  strength: number;
};

export type TasteCanon = {
  yes: TasteReference[];
  no: TasteReference[];
  /** Ready-to-embed prompt block; empty string when the canon is empty. */
  block: string;
};

const EMPTY_CANON: TasteCanon = { yes: [], no: [], block: "" };

type Row = {
  id: string;
  name: string;
  lane: string | null;
  kind: string;
  note: string | null;
  source: string;
  strength: number | null;
};

function refLine(ref: TasteReference): string {
  const lane = ref.lane ? ` (${ref.lane})` : "";
  const note = ref.note ? ` — ${ref.note.slice(0, 120)}` : "";
  return `${ref.name}${lane}${note}`;
}

export function buildCanonBlock(yes: TasteReference[], no: TasteReference[]): string {
  if (yes.length === 0 && no.length === 0) return "";
  const parts: string[] = [
    "REFERENCE CANON — judge by comparison to these, never in a vacuum:",
  ];
  if (yes.length) {
    parts.push(
      `YES references (the bar — what right looks like): ${yes.slice(0, 10).map(refLine).join("; ")}.`,
    );
  }
  if (no.length) {
    parts.push(
      `NO references (auto-reject energy): ${no.slice(0, 10).map(refLine).join("; ")}.`,
    );
  }
  parts.push(
    "Rule: a candidate that resembles a NO reference more than any YES reference is a kill, not a hedge. " +
      "Reasons may name the canon (\"the Costera of steak\") — that is the resolution taste works at.",
  );
  return parts.join("\n");
}

/**
 * Load the canon for a user, cross-domain refs plus the lane's own refs.
 * Lane-specific refs sort first so they dominate the prompt budget.
 */
export async function getTasteCanon(input: {
  userId: string;
  lane?: string | null;
  supabase?: SupabaseClient;
}): Promise<TasteCanon> {
  try {
    const supabase = input.supabase ?? getSupabaseServiceClient();
    let query = supabase
      .from("taste_references")
      .select("id, name, lane, kind, note, source, strength")
      .eq("user_id", input.userId)
      .order("strength", { ascending: false })
      .limit(40);
    if (input.lane) {
      query = query.or(`lane.is.null,lane.eq.${input.lane}`);
    }
    const { data, error } = await query;
    if (error || !data) return EMPTY_CANON;

    const refs = (data as Row[]).map(
      (r): TasteReference => ({
        id: r.id,
        name: r.name,
        lane: r.lane,
        kind: r.kind === "no" ? "no" : "yes",
        note: r.note,
        source: r.source,
        strength: typeof r.strength === "number" ? r.strength : 0.7,
      }),
    );
    const laneFirst = (a: TasteReference, b: TasteReference) =>
      Number(Boolean(b.lane)) - Number(Boolean(a.lane)) || b.strength - a.strength;
    const yes = refs.filter((r) => r.kind === "yes").sort(laneFirst);
    const no = refs.filter((r) => r.kind === "no").sort(laneFirst);
    return { yes, no, block: buildCanonBlock(yes, no) };
  } catch (error) {
    console.error("[taste.references] canon load failed", error);
    return EMPTY_CANON;
  }
}

/**
 * Upsert one reference by (user, name, kind). Existing refs keep their note
 * unless a new one is provided; strength only moves up (canon hardens, it
 * doesn't quietly decay from a weaker later signal).
 */
export async function upsertTasteReference(input: {
  userId: string;
  name: string;
  kind: "yes" | "no";
  lane?: string | null;
  note?: string | null;
  source?: "seed" | "experience" | "voice" | "manual";
  strength?: number;
  supabase?: SupabaseClient;
}): Promise<void> {
  const name = input.name.trim();
  if (!name) return;
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const strength = Math.max(0, Math.min(1, input.strength ?? 0.7));

  const { data } = await supabase
    .from("taste_references")
    .select("id, note, strength")
    .eq("user_id", input.userId)
    .eq("kind", input.kind)
    .ilike("name", name)
    .maybeSingle();

  if (data?.id) {
    const existing = data as { id: string; note: string | null; strength: number | null };
    await supabase
      .from("taste_references")
      .update({
        note: input.note?.trim() || existing.note,
        lane: input.lane ?? undefined,
        strength: Math.max(existing.strength ?? 0, strength),
        source: input.source ?? undefined,
      })
      .eq("id", existing.id)
      .eq("user_id", input.userId);
    return;
  }

  const { error } = await supabase.from("taste_references").insert({
    user_id: input.userId,
    name,
    kind: input.kind,
    lane: input.lane ?? null,
    note: input.note?.trim() || null,
    source: input.source ?? "manual",
    strength,
  });
  if (error) console.error("[taste.references] insert failed", error.message);
}
