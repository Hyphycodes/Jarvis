import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildAgentTasteBlock, type AgentTaste } from "@/lib/brain/categoryAgents";
import { operatingFitBlock } from "@/lib/operating/operatingPreferences";
import { getTasteCanon } from "@/lib/taste/references";

/**
 * Finds Specialist Council (per jarvis-finds-engine-brain-tree.md). Five voices —
 * Product Authenticity, Jerry-Fit, Budget/Utility, Devil's Advocate, Verdict —
 * judge finalists in ONE LLM call → final_score + buyer decision note. Operates on
 * the existing finds (ProductDossier), not a new warehouse. Pure scoring output;
 * the engine applies it to surfaced_items.
 */

export type FindCouncilInput = {
  id: string;
  title: string;
  brand?: string | null;
  price?: string | null;
  source_brain?: string | null;
  budget_tier?: string | null;
  why?: string | null;
};

export type FindCouncilVerdict = {
  id: string;
  final_score: number;
  decision_note: string | null;
  devil_kill: boolean;
};

export async function runFindsCouncil(input: {
  userId: string;
  finds: FindCouncilInput[];
  supabase?: SupabaseClient;
}): Promise<Map<string, FindCouncilVerdict>> {
  const out = new Map<string, FindCouncilVerdict>();
  if (!hasAnthropic() || input.finds.length === 0) return out;

  const [brain, canon] = await Promise.all([
    buildBrainContext({ userId: input.userId, includeWeather: false, supabase: input.supabase }),
    getTasteCanon({ userId: input.userId, lane: "finds", supabase: input.supabase }),
  ]);
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

  const system = [
    "You are Jerry's FINDS SPECIALIST COUNCIL — five voices in one verdict:",
    "1. Product Authenticity — actually quality, or just marketed well? Credible source/brand?",
    "2. Jerry-fit — fits his taste, closet, home, work, creative output? Subtle luxury, never flashy/logo-loud.",
    "3. Budget/Utility — realistic + useful + worth the spend at his ~$100k/balanced posture? Attainable/premium-realistic preferred; fantasy luxury is a hold.",
    "4. Devil's advocate — your only job is to KILL it for CLEAR reasons: duplicate, generic Amazon junk, hype-driven, fantasy luxury (unless asked), low utility, wrong brand. A real, useful, on-taste item must NOT be killed for being imperfect.",
    "5. Verdict writer — a crisp, DEFINITIVE buyer decision note: buy if / skip if. Never hedge; doubt is a lower score or a kill, not a hedged note.",
    "final_score is your honest 0..1 conviction this is worth sourcing for him.",
    "CALIBRATION: 0.9+ means it beats his YES references head-to-head. Most good finds live 0.6-0.8; anything closer to a NO reference than a YES reference dies here. He judges on whether the make and the line move him — not price, not brand prestige.",
  ].join("\n");
  const list = input.finds
    .map((f, i) => `${i}. ${f.title}${f.brand ? ` — ${f.brand}` : ""}${f.price ? ` (${f.price})` : ""}${f.source_brain ? ` [${f.source_brain}]` : ""}${f.budget_tier ? ` {${f.budget_tier}}` : ""}`)
    .join("\n");
  const prompt = [
    "Jerry's taste, pulled fresh:",
    buildAgentTasteBlock(taste),
    ...(canon.block ? ["", canon.block] : []),
    "",
    "Find finalists (index. title — brand (price) [brain] {tier}):",
    list,
    "",
    "Return strict JSON judging EVERY index:",
    `{ "verdicts": [{ "i": number, "final_score": number, "decision_note": string, "devil_kill": boolean }] }`,
  ].join("\n");

  let raw: unknown;
  try {
    raw = await generateStructured<unknown>({ system, prompt, schemaName: "finds_council", temperature: 0.3, maxTokens: 3000 });
  } catch {
    return out;
  }
  const verdicts = isRecord(raw) && Array.isArray(raw.verdicts) ? raw.verdicts : [];
  for (const e of verdicts) {
    if (!isRecord(e) || typeof e.i !== "number") continue;
    const f = input.finds[e.i];
    if (!f) continue;
    out.set(f.id, {
      id: f.id,
      final_score: clamp01(num(e.final_score)),
      decision_note: typeof e.decision_note === "string" ? e.decision_note : null,
      devil_kill: e.devil_kill === true,
    });
  }
  return out;
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
