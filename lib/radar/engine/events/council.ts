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
  EVENTS_SUBLIBRARIES,
  EVENT_SUBLIBRARIES,
  type EventSubLibrary,
} from "@/lib/radar/engine/events/config";
import type { CurrentEventRow } from "@/lib/types/database";

/**
 * Events Specialist Council (per jarvis-events-engine-brain-tree.md). Five voices
 * in one verdict — Authenticity, Jerry-Fit, Fit/Logistics, Devil's Advocate,
 * Verdict Writer — run ONLY on verified future finalists (LLM cost stays bounded).
 * Writes final_score + taste_vector + council verdict; devil-kills → rejected.
 * Generalizes the dining council (lib/radar/engine/council.ts).
 */

export const EVENTS_COUNCIL_FLOOR = 0.5;
const FINALIST_LIMIT = 10;

export type EventsCouncilResult = {
  subLibrary: EventSubLibrary;
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

export async function runEventsCouncil(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<EventsCouncilResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: EventsCouncilResult[] = [];
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
  const experiences = await getExperienceContext({ userId: input.userId, lane: "events", supabase });

  for (const subLibrary of EVENT_SUBLIBRARIES) {
    const result: EventsCouncilResult = { subLibrary, considered: 0, judged: 0, rejected: 0, errors: [] };
    const { data, error } = await supabase
      .from("current_events")
      .select("*")
      .eq("user_id", input.userId)
      .eq("sub_library", subLibrary)
      .in("status", ["verified", "surfaced"])
      .gt("starts_at", new Date().toISOString())
      .order("verdict_strength", { ascending: false, nullsFirst: false })
      .limit(FINALIST_LIMIT);
    if (error) {
      result.errors.push(`read finalists: ${error.message}`);
      out.push(result);
      continue;
    }
    const rows = (data ?? []) as CurrentEventRow[];
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
      const councilBlob = { verdict: v.verdict ?? null, devil_kill: Boolean(v.devil_kill), devil_detail: v.devil_detail ?? null };
      if (v.devil_kill || clamp01(v.final_score) < EVENTS_COUNCIL_FLOOR) {
        await supabase
          .from("current_events")
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
        .from("current_events")
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
  subLibrary: EventSubLibrary,
  taste: AgentTaste,
  rows: CurrentEventRow[],
  experiencesBlock: string,
): Promise<Map<number, Verdict>> {
  const cfg = EVENTS_SUBLIBRARIES[subLibrary];
  const system = [
    `You are the EVENTS SPECIALIST COUNCIL for the "${cfg.label}" sub-library — five voices in one verdict:`,
    "1. Authenticity — is this a REAL event with substance, or promoted/scraped noise?",
    "2. Jerry-fit — does it fit his taste, rhythm, spend, and social world? No scene/hype/corny/generic.",
    "3. Fit/Logistics — can it realistically work in his calendar/life (timing, friction, cost)?",
    "4. Devil's advocate — your only job is to find reasons to KILL it: too generic, far, loud, expensive, fake, weak.",
    "5. Verdict writer — synthesize a 2-4 sentence opinionated verdict + a 5-axis taste vector (craft/fit/timing/novelty/relational).",
    cfg.brief,
    "Rules: ONLY set devil_kill=true for CLEAR junk — fake/unverifiable, generic noise, wrong-category, or genuinely off his taste. A real, dated, on-taste event must NOT be devil-killed just for being imperfect — surface concerns in the verdict and a lower final_score instead, and let the floor decide. final_score is your honest 0..1 conviction this dated opportunity deserves Jerry's radar. An undated idea is NOT an event — score it low.",
  ].join("\n");

  const list = rows
    .map((r, i) => {
      const when = r.starts_at ? new Date(r.starts_at).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "no date";
      return `${i}. ${r.title}${r.venue_name ? ` @ ${r.venue_name}` : ""} — ${when}${r.ticket_url ? " (ticketed)" : ""}`;
    })
    .join("\n");
  const prompt = [
    "Jerry's taste, pulled fresh:",
    buildAgentTasteBlock(taste),
    ...(experiencesBlock ? ["", experiencesBlock] : []),
    "",
    "Event finalists (index. title @ venue — when):",
    list,
    "",
    "Return strict JSON judging EVERY index:",
    `{ "verdicts": [{ "i": number, "final_score": number, "verdict": string, "devil_kill": boolean, "devil_detail": string, "taste_vector": { "craft": number, "fit": number, "timing": number, "novelty": number, "relational": number } }] }`,
  ].join("\n");

  const raw = await generateStructured<unknown>({
    system,
    prompt,
    schemaName: `events_council_${subLibrary}`,
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
