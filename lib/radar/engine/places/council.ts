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
  PLACES_SUBLIBRARIES,
  PLACE_SUBLIBRARIES,
  type PlaceSubLibrary,
} from "@/lib/radar/engine/places/config";
import type { PlacesItemRow } from "@/lib/types/database";

/**
 * Places Specialist Council (per jarvis-places-engine-brain-tree.md). Five voices —
 * Authenticity, Jerry-Fit, ROLE/Use-Case (the Places-specific layer), Devil's
 * Advocate, Verdict Writer — LLM on un-judged finalists → final_score + taste
 * vector + verdict + primary_role; floor/devil → rejected.
 */

export const PLACES_COUNCIL_FLOOR = 0.5;
const FINALIST_LIMIT = 12;

export type PlacesCouncilResult = {
  subLibrary: PlaceSubLibrary;
  considered: number;
  judged: number;
  rejected: number;
  errors: string[];
};

type Verdict = {
  i: number;
  final_score: number;
  verdict?: string;
  primary_role?: string;
  best_use_case?: string;
  devil_kill?: boolean;
  taste_vector?: Record<string, number>;
};

export async function runPlacesCouncil(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<PlacesCouncilResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: PlacesCouncilResult[] = [];
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
  const experiences = await getExperienceContext({ userId: input.userId, lane: "places", supabase });

  for (const subLibrary of PLACE_SUBLIBRARIES) {
    const result: PlacesCouncilResult = { subLibrary, considered: 0, judged: 0, rejected: 0, errors: [] };
    const { data, error } = await supabase
      .from("places_items")
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
    const rows = (data ?? []) as PlacesItemRow[];
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
      if (v.devil_kill || clamp01(v.final_score) < PLACES_COUNCIL_FLOOR) {
        await supabase
          .from("places_items")
          .update({ status: "rejected", rejection_stage: "council", rejection_reason: v.devil_kill ? "devil_advocate_kill" : "council_floor", final_score: clamp01(v.final_score), updated_at: now })
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
      if (v.primary_role) update.primary_role = v.primary_role;
      if (v.best_use_case) update.best_use_case = v.best_use_case;
      if (v.taste_vector) update.taste_vector = mergeVector(v.taste_vector);
      const { error: upErr } = await supabase.from("places_items").update(update).eq("id", rows[i].id).eq("user_id", input.userId);
      if (upErr) result.errors.push(`judge ${rows[i].title}: ${upErr.message}`);
      else result.judged += 1;
    }
    out.push(result);
  }
  return out;
}

async function judge(
  subLibrary: PlaceSubLibrary,
  taste: AgentTaste,
  rows: PlacesItemRow[],
  experiencesBlock: string,
): Promise<Map<number, Verdict>> {
  const cfg = PLACES_SUBLIBRARIES[subLibrary];
  const system = [
    `You are the PLACES SPECIALIST COUNCIL for the "${cfg.label}" sub-library — five voices in one verdict:`,
    "1. Authenticity — genuinely useful/interesting place, or generic map filler?",
    "2. Jerry-fit — fits his world, rhythm, taste, and real movement patterns?",
    "3. Role/Use-Case — what ROLE does it play? destination / drift_zone / second_stop / quiet_reset / photo_location / meeting_spot / cigar_walk_zone / low_friction_fallback / neighborhood_anchor / creative_input.",
    "4. Devil's advocate — your only job is to KILL it: too generic, touristy, far, scene-heavy, weak reason, or actually a restaurant/event/culture/move.",
    "5. Verdict writer — synthesize a 2-4 sentence verdict + primary_role + best_use_case + a 5-axis taste vector (craft/fit/timing/novelty/relational).",
    cfg.brief,
    "Rules: Places are EVERGREEN spatial assets — no urgency. A restaurant/bar where food/drink is the point is Dining, not here. final_score is your honest 0..1 conviction this room/zone is worth knowing in his life. ONLY set devil_kill=true for CLEAR junk — generic map filler, no real identity/reason, or wrong-category. A real place worth knowing must NOT be devil-killed for being imperfect — lower the score and let the floor decide.",
  ].join("\n");

  const list = rows
    .map((r, i) => `${i}. ${r.title}${r.neighborhood ? ` — ${r.neighborhood}` : ""}${r.place_type ? ` [${r.place_type}]` : ""}${r.verdict ? ` — ${r.verdict.slice(0, 120)}` : ""}`)
    .join("\n");
  const prompt = [
    "Jerry's taste, pulled fresh:",
    buildAgentTasteBlock(taste),
    ...(experiencesBlock ? ["", experiencesBlock] : []),
    "",
    "Place finalists (index. name — neighborhood [type]):",
    list,
    "",
    "Return strict JSON judging EVERY index:",
    `{ "verdicts": [{ "i": number, "final_score": number, "verdict": string, "primary_role": string, "best_use_case": string, "devil_kill": boolean, "taste_vector": { "craft": number, "fit": number, "timing": number, "novelty": number, "relational": number } }] }`,
  ].join("\n");

  const raw = await generateStructured<unknown>({
    system,
    prompt,
    schemaName: `places_council_${subLibrary}`,
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
      primary_role: typeof e.primary_role === "string" ? e.primary_role : undefined,
      best_use_case: typeof e.best_use_case === "string" ? e.best_use_case : undefined,
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
