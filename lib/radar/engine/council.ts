import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildAgentTasteBlock, type AgentTaste } from "@/lib/brain/categoryAgents";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { type TasteVector } from "@/lib/radar/engine/tasteVector";
import { DINING_SUBLIBRARIES } from "@/lib/radar/engine/sources";
import { logRejections } from "@/lib/radar/engine/rejections";
import { getExperienceContext } from "@/lib/radar/engine/experienceContext";
import { operatingFitBlock } from "@/lib/operating/operatingPreferences";

/** Stage 6 — specialist council (authenticity + Jerry-fit + devil's advocate +
 *  verdict synthesis), built ON TOP of the preserved taste model (does not modify
 *  writeVerdict/scoreCategoryCouncil). Permissive floor for now; tighten once the
 *  bench is full. */
export const COUNCIL_FLOOR = 0.52;

export type CouncilResult = {
  subLibrary: string;
  considered: number;
  judged: number;
  rejectedFloor: number;
  rejectedDevil: number;
  errors: string[];
};

type FinalistRow = {
  id: string;
  name: string;
  sub_type: string | null;
  neighborhood: string | null;
  pre_score: number | null;
};

type CouncilVerdict = {
  i: number;
  final_score: number;
  taste_vector?: Partial<TasteVector>;
  verdict?: string;
  concerns?: string[];
  devil_kill?: boolean;
  devil_detail?: string;
};

export async function councilSubLibrary(input: {
  userId: string;
  subLibrary: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<CouncilResult> {
  const config = DINING_SUBLIBRARIES[input.subLibrary];
  const result: CouncilResult = {
    subLibrary: input.subLibrary,
    considered: 0,
    judged: 0,
    rejectedFloor: 0,
    rejectedDevil: 0,
    errors: [],
  };
  if (!config) {
    result.errors.push(`Unknown sub-library: ${input.subLibrary}`);
    return result;
  }
  if (!hasAnthropic()) {
    result.errors.push("ANTHROPIC_API_KEY not set — council skipped");
    return result;
  }
  const supabase = input.supabase ?? getSupabaseServiceClient();

  const { data, error } = await supabase
    .from(config.subLibrary)
    .select("id, name, sub_type, neighborhood, pre_score")
    .eq("user_id", input.userId)
    .eq("status", "finalist")
    .order("pre_score", { ascending: false, nullsFirst: false })
    .limit(input.limit ?? 12);
  if (error) {
    result.errors.push(`read finalists: ${error.message}`);
    return result;
  }
  const rows = (data ?? []) as FinalistRow[];
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
    operatingRead: operatingFitBlock(brain.operating),
  };

  // Jerry's own past feedback for this lane — the Experience Memory Engine
  // feeding curation so the shelf adapts to what he actually enjoyed.
  const experiences = await getExperienceContext({
    userId: input.userId,
    lane: config.lane,
    supabase,
  });

  let verdicts: Map<number, CouncilVerdict>;
  try {
    verdicts = await runCouncil(config.subLibrary, config.brief, taste, rows, experiences.block);
  } catch (err) {
    result.errors.push(`council LLM: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const now = new Date().toISOString();
  const devilKills: Array<{ candidateId: string; detail: string }> = [];
  const floorKills: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = verdicts.get(i);
    if (!v) continue; // model skipped — leave as finalist for next pass
    const councilBlob = {
      verdict: v.verdict ?? null,
      concerns: v.concerns ?? [],
      devil_kill: Boolean(v.devil_kill),
      devil_detail: v.devil_detail ?? null,
    };
    if (v.devil_kill) {
      const detail = (v.devil_detail && v.devil_detail.trim()) || "Devil's advocate kill (no detail given).";
      await supabase
        .from(config.subLibrary)
        .update({ status: "rejected", rejection_stage: "council", rejection_reason: "devil_advocate_kill", council: councilBlob })
        .eq("id", rows[i].id)
        .eq("user_id", input.userId);
      devilKills.push({ candidateId: rows[i].id, detail });
      result.rejectedDevil += 1;
      continue;
    }
    if (clamp01(v.final_score) < COUNCIL_FLOOR) {
      await supabase
        .from(config.subLibrary)
        .update({ status: "rejected", rejection_stage: "council", rejection_reason: "council_floor", council: councilBlob, final_score: clamp01(v.final_score) })
        .eq("id", rows[i].id)
        .eq("user_id", input.userId);
      floorKills.push(rows[i].id);
      result.rejectedFloor += 1;
      continue;
    }
    const update: Record<string, unknown> = {
      status: "judged",
      final_score: clamp01(v.final_score),
      council: councilBlob,
      last_seen_at: now,
    };
    if (v.taste_vector) update.taste_vector = mergeVector(v.taste_vector);
    const { error: upErr } = await supabase
      .from(config.subLibrary)
      .update(update)
      .eq("id", rows[i].id)
      .eq("user_id", input.userId);
    if (upErr) result.errors.push(`judge ${rows[i].name}: ${upErr.message}`);
    else result.judged += 1;
  }

  if (devilKills.length > 0) {
    await logRejections(supabase, {
      userId: input.userId, subLibrary: config.subLibrary, stage: "council",
      reason: "devil_advocate_kill", entries: devilKills,
    });
  }
  if (floorKills.length > 0) {
    await logRejections(supabase, {
      userId: input.userId, subLibrary: config.subLibrary, stage: "council",
      reason: "council_floor", entries: floorKills.map((id) => ({ candidateId: id })),
    });
  }
  return result;
}

export async function councilDining(input: {
  userId: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<CouncilResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: CouncilResult[] = [];
  for (const subLibrary of Object.keys(DINING_SUBLIBRARIES)) {
    out.push(await councilSubLibrary({ userId: input.userId, subLibrary, supabase, limit: input.limit }));
  }
  return out;
}

async function runCouncil(
  subLibrary: string,
  brief: string,
  taste: AgentTaste,
  rows: FinalistRow[],
  experiencesBlock: string,
): Promise<Map<number, CouncilVerdict>> {
  const system = [
    `You are the SPECIALIST COUNCIL for the "${subLibrary}" sub-library — four voices in one verdict:`,
    "1. Authenticity agent — is the thing genuinely good, or well-marketed noise?",
    "2. Jerry-fit agent — hard criteria against his taste and relational map; no scene/pretense/tourist/corny/generic.",
    "3. Devil's advocate — your only job is to find reasons to KILL it; every yes must be earned.",
    "4. Verdict writer — synthesize into a 2-4 sentence opinionated verdict + a 5-axis taste vector.",
    brief,
    "Rules: if the devil's advocate's case is decisive, set devil_kill=true and give devil_detail (a plain-English reason). " +
      "If concerns are real but not fatal, DON'T kill — surface them in `concerns` and reflect them in the verdict and a lower final_score, " +
      "so the later head-to-head round can weigh them. final_score is your honest 0.0-1.0 conviction.",
  ].join("\n");

  const list = rows
    .map((r, i) => `${i}. ${r.name}${r.sub_type ? ` (${r.sub_type})` : ""}${r.neighborhood ? ` — ${r.neighborhood}` : ""}`)
    .join("\n");
  const prompt = [
    "Jerry's taste, pulled fresh:",
    buildAgentTasteBlock(taste),
    ...(experiencesBlock ? ["", experiencesBlock] : []),
    "",
    "Finalists (index. name):",
    list,
    "",
    "Return strict JSON judging EVERY index:",
    `{ "verdicts": [{ "i": number, "final_score": number, "verdict": string, "concerns": string[], "devil_kill": boolean, "devil_detail": string, "taste_vector": { "craft": number, "fit": number, "timing": number, "novelty": number, "relational": number } }] }`,
  ].join("\n");

  const raw = await generateStructured<unknown>({
    system,
    prompt,
    schemaName: `council_${subLibrary}`,
    temperature: 0.3,
    maxTokens: 4096,
  });

  const out = new Map<number, CouncilVerdict>();
  const verdicts = isRecord(raw) && Array.isArray(raw.verdicts) ? raw.verdicts : [];
  for (const entry of verdicts) {
    if (!isRecord(entry) || typeof entry.i !== "number") continue;
    out.set(entry.i, {
      i: entry.i,
      final_score: num(entry.final_score),
      verdict: typeof entry.verdict === "string" ? entry.verdict : undefined,
      concerns: Array.isArray(entry.concerns) ? entry.concerns.filter((c): c is string => typeof c === "string") : undefined,
      devil_kill: entry.devil_kill === true,
      devil_detail: typeof entry.devil_detail === "string" ? entry.devil_detail : undefined,
      taste_vector: isRecord(entry.taste_vector) ? (entry.taste_vector as Partial<TasteVector>) : undefined,
    });
  }
  return out;
}

function mergeVector(v: Partial<TasteVector>): TasteVector {
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
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
