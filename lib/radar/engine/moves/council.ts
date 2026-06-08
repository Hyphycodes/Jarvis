import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildAgentTasteBlock, type AgentTaste } from "@/lib/brain/categoryAgents";
import { operatingFitBlock } from "@/lib/operating/operatingPreferences";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getExperienceContext } from "@/lib/radar/engine/experienceContext";
import { MOVES_SUBLIBRARIES, MOVE_SUBLIBRARIES, type MoveSubLibrary } from "@/lib/radar/engine/moves/config";
import type { MovesItemRow } from "@/lib/types/database";

/**
 * Moves Specialist Council (per jarvis-moves-engine-brain-tree.md). Five voices —
 * Actionability, Fit/Energy, Jerry-Fit, Devil's Advocate, Verdict — LLM on
 * un-judged finalists → final_score + taste vector + verdict; floor/devil → rejected.
 */

export const MOVES_COUNCIL_FLOOR = 0.5;
const FINALIST_LIMIT = 14;

export type MovesCouncilResult = {
  subLibrary: MoveSubLibrary;
  considered: number;
  judged: number;
  rejected: number;
  errors: string[];
};

type Verdict = {
  i: number;
  final_score: number;
  verdict?: string;
  devil_kill?: boolean;
  taste_vector?: Record<string, number>;
};

export async function runMovesCouncil(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<MovesCouncilResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: MovesCouncilResult[] = [];
  if (!hasAnthropic()) return out;

  const brain = await buildBrainContext({ userId: input.userId, includeWeather: true, supabase });
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
    operatingRead: operatingFitBlock(brain.operating),
  };
  const experiences = await getExperienceContext({ userId: input.userId, lane: "moves", supabase });

  for (const subLibrary of MOVE_SUBLIBRARIES) {
    const result: MovesCouncilResult = { subLibrary, considered: 0, judged: 0, rejected: 0, errors: [] };
    const { data, error } = await supabase
      .from("moves_items")
      .select("*")
      .eq("user_id", input.userId)
      .eq("sub_library", subLibrary)
      .eq("status", "discovered")
      .is("final_score", null)
      .order("pre_score", { ascending: false, nullsFirst: false })
      .limit(FINALIST_LIMIT);
    if (error) {
      result.errors.push(`read finalists: ${error.message}`);
      out.push(result);
      continue;
    }
    const rows = (data ?? []) as MovesItemRow[];
    result.considered = rows.length;
    if (rows.length === 0) {
      out.push(result);
      continue;
    }

    let verdicts: Map<number, Verdict>;
    try {
      verdicts = await judge(subLibrary, taste, rows, experiences.block);
    } catch (err) {
      result.errors.push(`council LLM: ${err instanceof Error ? err.message : String(err)}`);
      out.push(result);
      continue;
    }

    const now = new Date().toISOString();
    for (let i = 0; i < rows.length; i++) {
      const v = verdicts.get(i);
      if (!v) continue;
      if (v.devil_kill || clamp01(v.final_score) < MOVES_COUNCIL_FLOOR) {
        await supabase
          .from("moves_items")
          .update({ status: "rejected", rejection_stage: "council", rejection_reason: v.devil_kill ? "devil_advocate_kill" : "council_floor", final_score: clamp01(v.final_score), updated_at: now })
          .eq("id", rows[i].id)
          .eq("user_id", input.userId);
        result.rejected += 1;
        continue;
      }
      const update: Record<string, unknown> = { final_score: clamp01(v.final_score), verdict: v.verdict ?? rows[i].verdict, last_seen_at: now, updated_at: now };
      if (v.taste_vector) update.taste_vector = mergeVector(v.taste_vector);
      const { error: upErr } = await supabase.from("moves_items").update(update).eq("id", rows[i].id).eq("user_id", input.userId);
      if (upErr) result.errors.push(`judge ${rows[i].title}: ${upErr.message}`);
      else result.judged += 1;
    }
    out.push(result);
  }
  return out;
}

async function judge(
  subLibrary: MoveSubLibrary,
  taste: AgentTaste,
  rows: MovesItemRow[],
  experiencesBlock: string,
): Promise<Map<number, Verdict>> {
  const cfg = MOVES_SUBLIBRARIES[subLibrary];
  const system = [
    `You are the MOVES SPECIALIST COUNCIL for the "${cfg.label}" sub-library — five voices in one verdict:`,
    "1. Actionability — is this concrete enough to DO right now? Real sequence / clear next action?",
    "2. Fit/Energy — does it fit his time, energy, weather, rhythm, and current mode?",
    "3. Jerry-fit — does it fit his actual life/taste, or is it generic self-improvement fluff?",
    "4. Devil's advocate — your only job is to KILL it: vague, no sequence, corny, generic, weak payoff, wrong timing, or wrong-category (a place/restaurant/event with no real action).",
    "5. Verdict writer — synthesize a 2-4 sentence verdict + a 5-axis taste vector (craft/fit/timing/novelty/relational).",
    cfg.brief,
    "Rules: A Move's central object is the ACTION. ONLY set devil_kill=true for CLEAR junk — vague/no-sequence, generic self-help, or wrong-category. A concrete, on-taste move must NOT be devil-killed for being simple — lower the score and let the floor decide. final_score is your honest 0..1 conviction this is worth Jerry actually doing.",
  ].join("\n");

  const list = rows
    .map((r, i) => `${i}. ${r.title}${r.location_name ? ` @ ${r.location_name}` : ""}${r.suggested_window ? ` (${r.suggested_window})` : ""}${r.description ? ` — ${r.description.slice(0, 120)}` : ""}`)
    .join("\n");
  const prompt = [
    "Jerry's taste, pulled fresh:",
    buildAgentTasteBlock(taste),
    ...(experiencesBlock ? ["", experiencesBlock] : []),
    "",
    "Move finalists (index. title @ where (window) — flow):",
    list,
    "",
    "Return strict JSON judging EVERY index:",
    `{ "verdicts": [{ "i": number, "final_score": number, "verdict": string, "devil_kill": boolean, "taste_vector": { "craft": number, "fit": number, "timing": number, "novelty": number, "relational": number } }] }`,
  ].join("\n");

  const raw = await generateStructured<unknown>({
    system,
    prompt,
    schemaName: `moves_council_${subLibrary}`,
    temperature: 0.3,
    maxTokens: 3000,
  });
  const out = new Map<number, Verdict>();
  const verdicts = isRecord(raw) && Array.isArray(raw.verdicts) ? raw.verdicts : [];
  for (const e of verdicts) {
    if (!isRecord(e) || typeof e.i !== "number") continue;
    out.set(e.i, {
      i: e.i,
      final_score: num(e.final_score),
      verdict: typeof e.verdict === "string" ? e.verdict : undefined,
      devil_kill: e.devil_kill === true,
      taste_vector: isRecord(e.taste_vector) ? (e.taste_vector as Record<string, number>) : undefined,
    });
  }
  return out;
}

function mergeVector(v: Record<string, number>): Record<string, number> {
  return {
    craft: clamp01(num(v.craft)),
    fit: clamp01(num(v.fit)),
    timing: clamp01(num(v.timing)),
    novelty: clamp01(num(v.novelty)),
    relational: clamp01(num(v.relational)),
  };
}
function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
