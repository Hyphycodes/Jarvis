import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildAgentTasteBlock, type AgentTaste } from "@/lib/brain/categoryAgents";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { blendTasteVector, weightsFor, type TasteVector } from "@/lib/radar/engine/tasteVector";
import { DINING_SUBLIBRARIES } from "@/lib/radar/engine/sources";
import { logRejections } from "@/lib/radar/engine/rejections";

/** Stage 3 — cheap multi-axis pre-score (no council). Quick taste-vector pass
 *  that ranks the rough field; floor 0.5 kills obvious mismatches. */
export const PRE_SCORE_FLOOR = 0.5;

export type PreScoreResult = {
  subLibrary: string;
  considered: number;
  scored: number;
  rejected: number;
  errors: string[];
};

type DiscoveredRow = { id: string; name: string; sub_type: string | null; neighborhood: string | null };
type AxisScores = { craft: number; fit: number; timing: number; novelty: number; relational: number };

export async function preScoreSubLibrary(input: {
  userId: string;
  subLibrary: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<PreScoreResult> {
  const config = DINING_SUBLIBRARIES[input.subLibrary];
  const result: PreScoreResult = {
    subLibrary: input.subLibrary,
    considered: 0,
    scored: 0,
    rejected: 0,
    errors: [],
  };
  if (!config) {
    result.errors.push(`Unknown sub-library: ${input.subLibrary}`);
    return result;
  }
  if (!hasAnthropic()) {
    result.errors.push("ANTHROPIC_API_KEY not set — pre-score skipped");
    return result;
  }
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const limit = input.limit ?? 40;

  const { data, error } = await supabase
    .from(config.subLibrary)
    .select("id, name, sub_type, neighborhood")
    .eq("user_id", input.userId)
    .eq("status", "discovered")
    .order("first_seen_at", { ascending: true })
    .limit(limit);
  if (error) {
    result.errors.push(`read discovered: ${error.message}`);
    return result;
  }
  const rows = (data ?? []) as DiscoveredRow[];
  result.considered = rows.length;
  if (rows.length === 0) return result;

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

  let vectors: Map<number, AxisScores>;
  try {
    vectors = await scoreVectors(config.subLibrary, config.brief, taste, rows);
  } catch (err) {
    result.errors.push(`pre-score LLM: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const weights = weightsFor(config.subLibrary);
  const now = new Date().toISOString();
  const rejectedIds: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const axes = vectors.get(i);
    if (!axes) continue; // model skipped one — leave discovered for the next pass
    const vector: TasteVector = clampVector(axes);
    const pre = blendTasteVector(vector, weights);
    if (pre < PRE_SCORE_FLOOR) {
      rejectedIds.push(rows[i].id);
      result.rejected += 1;
      continue;
    }
    const { error: upErr } = await supabase
      .from(config.subLibrary)
      .update({ status: "scored", pre_score: pre, taste_vector: vector, last_seen_at: now })
      .eq("id", rows[i].id)
      .eq("user_id", input.userId);
    if (upErr) result.errors.push(`update ${rows[i].name}: ${upErr.message}`);
    else result.scored += 1;
  }

  if (rejectedIds.length > 0) {
    await supabase
      .from(config.subLibrary)
      .update({ status: "rejected", rejection_stage: "pre_score", rejection_reason: "pre_score_low" })
      .in("id", rejectedIds)
      .eq("user_id", input.userId);
    await logRejections(supabase, {
      userId: input.userId,
      subLibrary: config.subLibrary,
      stage: "pre_score",
      reason: "pre_score_low",
      entries: rejectedIds.map((id) => ({ candidateId: id })),
    });
  }

  return result;
}

export async function preScoreDining(input: {
  userId: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<PreScoreResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: PreScoreResult[] = [];
  for (const subLibrary of Object.keys(DINING_SUBLIBRARIES)) {
    out.push(await preScoreSubLibrary({ userId: input.userId, subLibrary, supabase, limit: input.limit }));
  }
  return out;
}

async function scoreVectors(
  subLibrary: string,
  brief: string,
  taste: AgentTaste,
  rows: DiscoveredRow[],
): Promise<Map<number, AxisScores>> {
  const system = [
    `You are the cheap PRE-SCORER for the "${subLibrary}" sub-library.`,
    brief,
    "Score each candidate fast on five 0.0–1.0 taste axes — this is a rough kill gate, not a full verdict:",
    "- craft: is the thing itself genuinely good (real identity vs trend/marketing)?",
    "- fit: is it Jerry? no scene/pretense/tourist/corny/generic.",
    "- timing: right for the season/now?",
    "- novelty: fresh vs something he's likely already seen/owns?",
    "- relational: does it connect to his people?",
    "Be decisive: obvious mismatches should score low so they die here.",
  ].join("\n");

  const list = rows
    .map((r, i) => `${i}. ${r.name}${r.sub_type ? ` (${r.sub_type})` : ""}${r.neighborhood ? ` — ${r.neighborhood}` : ""}`)
    .join("\n");
  const prompt = [
    "Jerry's taste, pulled fresh:",
    buildAgentTasteBlock(taste),
    "",
    "Candidates (index. name):",
    list,
    "",
    "Return strict JSON scoring EVERY index:",
    `{ "scores": [{ "i": number, "craft": number, "fit": number, "timing": number, "novelty": number, "relational": number }] }`,
  ].join("\n");

  const raw = await generateStructured<unknown>({
    system,
    prompt,
    schemaName: `prescore_${subLibrary}`,
    temperature: 0.2,
    maxTokens: 4000,
  });

  const out = new Map<number, AxisScores>();
  const scores = isRecord(raw) && Array.isArray(raw.scores) ? raw.scores : [];
  for (const entry of scores) {
    if (!isRecord(entry) || typeof entry.i !== "number") continue;
    out.set(entry.i, {
      craft: num(entry.craft),
      fit: num(entry.fit),
      timing: num(entry.timing),
      novelty: num(entry.novelty),
      relational: num(entry.relational),
    });
  }
  return out;
}

function clampVector(a: AxisScores): TasteVector {
  const c = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
  return { craft: c(a.craft), fit: c(a.fit), timing: c(a.timing), novelty: c(a.novelty), relational: c(a.relational) };
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
