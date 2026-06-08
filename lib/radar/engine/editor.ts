import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildAgentTasteBlock, type AgentTaste } from "@/lib/brain/categoryAgents";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { logRejections } from "@/lib/radar/engine/rejections";

/** Stage 10 — Category editor assembles the lane SET.
 *  Reads category_best rows for the lane, assembles a coherent shelf (balance /
 *  variety / POV), annotates each with editor_notes, writes survivors to
 *  radar_library. Items cut here → rejected/editor_cut. */

export const EDITOR_SHELF_SIZE = 30; // target bench depth; editor picks best set up to this

export type EditorResult = {
  lane: string;
  considered: number;
  graduated: number; // written to radar_library
  cut: number;
  errors: string[];
};

type CategoryBestRow = {
  id: string;
  source_sub_library: string;
  name: string;
  sub_type: string | null;
  neighborhood: string | null;
  final_score: number | null;
  comparative_rank: number | null;
  enrichment_data: Record<string, unknown> | null;
};

type EditorSelection = {
  i: number;
  keep: boolean;
  editor_notes?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function editorAssembleLane(input: {
  userId: string;
  lane: string;
  supabase?: SupabaseClient;
  shelfSize?: number;
}): Promise<EditorResult> {
  const result: EditorResult = { lane: input.lane, considered: 0, graduated: 0, cut: 0, errors: [] };
  if (!hasAnthropic()) {
    result.errors.push("ANTHROPIC_API_KEY not set — editor skipped");
    return result;
  }
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const shelfSize = input.shelfSize ?? EDITOR_SHELF_SIZE;

  // Read category_best rows for this lane that haven't been graduated yet
  const { data, error } = await supabase
    .from("category_best")
    .select("id, source_sub_library, name, sub_type, neighborhood, final_score, comparative_rank, enrichment_data")
    .eq("user_id", input.userId)
    .eq("lane", input.lane)
    .is("plan_id", null) // not yet graduated (plan_id used as graduation flag until radar_library populated)
    .order("comparative_rank", { ascending: true, nullsFirst: false });
  if (error) {
    result.errors.push(`read category_best: ${error.message}`);
    return result;
  }
  const rows = (data ?? []) as CategoryBestRow[];
  result.considered = rows.length;
  if (rows.length === 0) return result;

  // If small enough, keep all — no need for editor LLM call
  let selections: EditorSelection[];
  if (rows.length <= shelfSize) {
    selections = rows.map((_, i) => ({ i, keep: true }));
  } else {
    const brain = await buildBrainContext({ userId: input.userId, includeWeather: false, supabase });
    const taste: AgentTaste = {
      displayName: brain.founder?.displayName ?? null,
      city: brain.homeCity?.trim() || "Chicago",
      lifeDirection: brain.founder?.lifeDirection ?? null,
      currentFocus: brain.founder?.currentFocus ?? null,
      vibeKeywords: brain.founder?.vibeKeywords ?? [],
      avoidKeywords: brain.founder?.avoidKeywords ?? [],
      dealbreakers: brain.founder?.dealbreakers ?? [],
      pinnedPrinciples: brain.founder?.pinnedPrinciples ?? [],
      memories: (brain.memory ?? []).map((m) => ({ content: m.content, kind: m.kind })),
      northTags: brain.northTags ?? [],
    };
    try {
      selections = await runEditor(input.lane, taste, rows, shelfSize);
    } catch (err) {
      result.errors.push(`editor LLM: ${err instanceof Error ? err.message : String(err)}`);
      return result;
    }
  }

  const now = new Date().toISOString();
  const cutIds: string[] = [];
  const cutSubLibraries: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sel = selections.find((s) => s.i === i);
    const keep = sel ? sel.keep : true; // default keep if editor skipped this index

    if (keep) {
      // Graduate to radar_library
      const { error: insErr } = await supabase.from("radar_library").insert({
        user_id: input.userId,
        lane: input.lane,
        source_category_best_id: row.id,
        name: row.name,
        sub_type: row.sub_type,
        neighborhood: row.neighborhood,
        final_score: row.final_score,
        enrichment_data: row.enrichment_data ?? {},
        graduated_at: now,
      });
      if (insErr && !insErr.message.includes("duplicate")) {
        result.errors.push(`graduate ${row.name}: ${insErr.message}`);
        continue;
      }
      // Mark category_best as graduated (using plan_id='00000000-0000-0000-0000-000000000001' as sentinel)
      await supabase
        .from("category_best")
        .update({ editor_notes: sel?.editor_notes ?? null, plan_id: "00000000-0000-0000-0000-000000000001" })
        .eq("id", row.id)
        .eq("user_id", input.userId);
      result.graduated += 1;
    } else {
      await supabase
        .from("category_best")
        .update({ editor_notes: sel?.editor_notes ?? "editor_cut" })
        .eq("id", row.id)
        .eq("user_id", input.userId);
      cutIds.push(row.id);
      cutSubLibraries.push(row.source_sub_library);
      result.cut += 1;
    }
  }

  if (cutIds.length > 0) {
    // Group by sub_library for rejection logging
    const byLib = new Map<string, string[]>();
    for (let i = 0; i < cutIds.length; i++) {
      const lib = cutSubLibraries[i];
      if (!byLib.has(lib)) byLib.set(lib, []);
      byLib.get(lib)!.push(cutIds[i]);
    }
    for (const [lib, ids] of byLib) {
      await logRejections(supabase, {
        userId: input.userId,
        subLibrary: lib,
        stage: "editor",
        reason: "editor_cut",
        entries: ids.map((id) => ({ candidateId: id })),
      });
    }
  }
  return result;
}

async function runEditor(
  lane: string,
  taste: AgentTaste,
  rows: CategoryBestRow[],
  shelfSize: number,
): Promise<EditorSelection[]> {
  const system = [
    `You are the CATEGORY EDITOR for the "${lane}" lane.`,
    "These items passed the specialist council and comparative round. Your job is to assemble the final shelf as a SET.",
    `Keep up to ${shelfSize} items. The shelf should have: range across sub-types, geographic spread, a mix of can't-miss anchors and interesting discoveries.`,
    "Cut items that are redundant (same vibe + same neighborhood), too mainstream, or that weaken the overall shelf's POV.",
    "For each item you keep, write a short editor_notes (1 sentence: why this earns its place on the shelf).",
    "For each item you cut, keep=false (no note needed).",
  ].join("\n");

  const list = rows
    .map(
      (r, i) =>
        `${i}. [${r.source_sub_library}] ${r.name}${r.sub_type ? ` (${r.sub_type})` : ""}${r.neighborhood ? ` — ${r.neighborhood}` : ""} | score=${(r.final_score ?? 0).toFixed(2)} rank=${r.comparative_rank ?? "?"}`,
    )
    .join("\n");

  const prompt = [
    "Jerry's taste:",
    buildAgentTasteBlock(taste),
    "",
    `Category best (${rows.length} items — assess ALL, keep up to ${shelfSize}):`,
    list,
    "",
    "Return strict JSON for every index:",
    `{ "selections": [{ "i": number, "keep": boolean, "editor_notes": string }] }`,
  ].join("\n");

  const raw = await generateStructured<unknown>({
    system,
    prompt,
    schemaName: `editor_${lane}`,
    temperature: 0.2,
    maxTokens: 2048,
  });

  const selections: EditorSelection[] = [];
  const list2 = isRecord(raw) && Array.isArray(raw.selections) ? raw.selections : [];
  for (const entry of list2) {
    if (!isRecord(entry) || typeof entry.i !== "number") continue;
    selections.push({
      i: entry.i,
      keep: entry.keep !== false,
      editor_notes: typeof entry.editor_notes === "string" ? entry.editor_notes : undefined,
    });
  }
  // Fallback: missing index → keep
  const seen = new Set(selections.map((s) => s.i));
  for (let i = 0; i < rows.length; i++) {
    if (!seen.has(i)) selections.push({ i, keep: true });
  }
  return selections;
}
