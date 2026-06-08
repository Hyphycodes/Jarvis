import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildAgentTasteBlock, type AgentTaste } from "@/lib/brain/categoryAgents";
import { operatingFitBlock } from "@/lib/operating/operatingPreferences";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getExperienceContext } from "@/lib/radar/engine/experienceContext";
import {
  CULTURE_SUBLIBRARIES,
  CULTURE_SUBLIBRARIES_ALL,
  type CultureSubLibrary,
} from "@/lib/radar/engine/culture/config";
import type { CultureItemRow } from "@/lib/types/database";

/**
 * Culture Specialist Council (per jarvis-culture-engine-brain-tree.md). Six voices —
 * Authenticity, Jerry-Fit, DEPTH (the culture-specific layer), Fit/Logistics,
 * Devil's Advocate, Verdict Writer — LLM on un-judged finalists only. Writes
 * final_score + taste vector + verdict; devil-kills/floor → rejected.
 */

export const CULTURE_COUNCIL_FLOOR = 0.5;
const FINALIST_LIMIT = 10;

export type CultureCouncilResult = {
  subLibrary: CultureSubLibrary;
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
  devil_detail?: string;
  taste_vector?: Record<string, number>;
};

export async function runCultureCouncil(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<CultureCouncilResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: CultureCouncilResult[] = [];
  if (!hasAnthropic()) return out;

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
  const experiences = await getExperienceContext({ userId: input.userId, lane: "culture", supabase });

  for (const subLibrary of CULTURE_SUBLIBRARIES_ALL) {
    const result: CultureCouncilResult = { subLibrary, considered: 0, judged: 0, rejected: 0, errors: [] };
    const { data, error } = await supabase
      .from("culture_items")
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
    const rows = (data ?? []) as CultureItemRow[];
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
      if (v.devil_kill || clamp01(v.final_score) < CULTURE_COUNCIL_FLOOR) {
        await supabase
          .from("culture_items")
          .update({
            status: "rejected",
            rejection_stage: "council",
            rejection_reason: v.devil_kill ? "devil_advocate_kill" : "council_floor",
            final_score: clamp01(v.final_score),
            verdict: v.verdict ?? null,
            updated_at: now,
          })
          .eq("id", rows[i].id)
          .eq("user_id", input.userId);
        result.rejected += 1;
        continue;
      }
      const update: Record<string, unknown> = {
        final_score: clamp01(v.final_score),
        verdict: v.verdict ?? rows[i].verdict,
        last_seen_at: now,
        updated_at: now,
      };
      if (v.taste_vector) update.taste_vector = mergeVector(v.taste_vector);
      const { error: upErr } = await supabase
        .from("culture_items")
        .update(update)
        .eq("id", rows[i].id)
        .eq("user_id", input.userId);
      if (upErr) result.errors.push(`judge ${rows[i].title}: ${upErr.message}`);
      else result.judged += 1;
    }
    out.push(result);
  }
  return out;
}

async function judge(
  subLibrary: CultureSubLibrary,
  taste: AgentTaste,
  rows: CultureItemRow[],
  experiencesBlock: string,
): Promise<Map<number, Verdict>> {
  const cfg = CULTURE_SUBLIBRARIES[subLibrary];
  const system = [
    `You are the CULTURE SPECIALIST COUNCIL for the "${cfg.label}" sub-library — six voices in one verdict:`,
    "1. Authenticity — culturally real with substance, or marketed noise?",
    "2. Jerry-fit — matches his taste, creative direction, social world, and growth edge?",
    "3. Depth — does it deepen taste/conversation/creative input, or is it shallow/tourist/influencer-coded?",
    "4. Fit/Logistics — realistic right now (weekday/weekend, distance, energy, current mode)?",
    "5. Devil's advocate — your only job is to KILL it: too shallow, touristy, boring, corny, too academic, too far, unsupported claims.",
    "6. Verdict writer — synthesize a 2-4 sentence opinionated verdict + a 5-axis taste vector (craft/fit/timing/novelty/relational).",
    cfg.brief,
    "Rules: Culture is mostly TIMELESS — do NOT invent urgency. A dated single happening belongs in Events, not here. final_score is your honest 0..1 conviction this deepens his taste/worldview enough to deserve radar attention. Shallow tourist bait → devil_kill.",
  ].join("\n");

  const list = rows
    .map((r, i) => `${i}. ${r.title}${r.institution_name ? ` @ ${r.institution_name}` : ""}${r.is_dated && r.starts_at ? ` (dated ${r.starts_at.slice(0, 10)})` : " (timeless)"}${r.description ? ` — ${r.description.slice(0, 140)}` : ""}`)
    .join("\n");
  const prompt = [
    "Jerry's taste, pulled fresh:",
    buildAgentTasteBlock(taste),
    ...(experiencesBlock ? ["", experiencesBlock] : []),
    "",
    "Culture finalists (index. title @ institution):",
    list,
    "",
    "Return strict JSON judging EVERY index:",
    `{ "verdicts": [{ "i": number, "final_score": number, "verdict": string, "devil_kill": boolean, "devil_detail": string, "taste_vector": { "craft": number, "fit": number, "timing": number, "novelty": number, "relational": number } }] }`,
  ].join("\n");

  const raw = await generateStructured<unknown>({
    system,
    prompt,
    schemaName: `culture_council_${subLibrary}`,
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
      devil_detail: typeof e.devil_detail === "string" ? e.devil_detail : undefined,
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
