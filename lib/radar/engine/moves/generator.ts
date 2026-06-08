import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { buildAgentTasteBlock, type AgentTaste } from "@/lib/brain/categoryAgents";
import { operatingFitBlock } from "@/lib/operating/operatingPreferences";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { normalizeExternalId } from "@/lib/radar/engine/curation";
import { classifyMoveSubLibrary, MOVE_SUBLIBRARIES } from "@/lib/radar/engine/moves/config";

/**
 * Moves generator — the "scout" for the generative Moves lane. One LLM call turns
 * the user's live context (city, weather, rhythm, operating mode, North balance,
 * nearby places) into concrete, doable moves with a real sequence + gear. Writes
 * moves_items (status='discovered'). Concrete actions only — never vague ideas.
 */

export type MoveGenResult = { generated: number; added: number; skippedExisting: number; errors: string[] };

type GenMove = {
  title: string;
  sub_library?: string;
  move_kind?: string;
  activity_type?: string;
  location_name?: string;
  neighborhood?: string;
  suggested_window?: string;
  duration_minutes?: number;
  price_hint?: string;
  booking_url?: string;
  sequence?: Array<{ label: string; detail?: string; duration_minutes?: number }>;
  gear_needed?: string[];
  prep_notes?: string[];
  north_pillars?: string[];
  vibe_keywords?: string[];
};

export async function generateMoves(input: {
  userId: string;
  supabase?: SupabaseClient;
  target?: number;
}): Promise<MoveGenResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const result: MoveGenResult = { generated: 0, added: 0, skippedExisting: 0, errors: [] };
  if (!hasAnthropic()) return result;

  const brain = await buildBrainContext({ userId: input.userId, includeWeather: true, supabase });
  const city = brain.homeCity?.trim() || "Chicago";
  const taste: AgentTaste = {
    displayName: brain.founder?.displayName ?? null,
    city,
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

  // Recent moves to avoid regenerating the same ones.
  const { data: existingRows } = await supabase
    .from("moves_items")
    .select("external_id")
    .eq("user_id", input.userId)
    .in("status", ["discovered", "shown", "saved", "planned"])
    .limit(200);
  const existing = new Set<string>(
    ((existingRows ?? []) as Array<{ external_id: string | null }>).map((r) => r.external_id).filter((v): v is string => Boolean(v)),
  );

  const weather = brain.weather
    ? `Weather now: ${Math.round(brain.weather.temperatureF)}°F, wind ${Math.round(brain.weather.windMph)}mph (code ${brain.weather.weatherCode}).`
    : "Weather: unknown.";
  const rhythm = brain.weeklyRhythm?.enabled
    ? `Workdays ${brain.weeklyRhythm.workdays.join(", ")}; leaves ${brain.weeklyRhythm.leaveHome}, home ${brain.weeklyRhythm.arriveHome}.`
    : "";

  let moves: GenMove[];
  try {
    moves = await generate(taste, city, weather, rhythm, input.target ?? 12);
  } catch (err) {
    result.errors.push(`generate: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }
  result.generated = moves.length;

  const rows: Array<Record<string, unknown>> = [];
  const batchSeen = new Set<string>();
  for (const m of moves) {
    const title = m.title?.trim();
    if (!title) continue;
    const seq = Array.isArray(m.sequence) ? m.sequence.filter((s) => s && typeof s.label === "string") : [];
    if (seq.length === 0) continue; // no sequence = not a Move
    const externalId = normalizeExternalId(title);
    if (existing.has(externalId) || batchSeen.has(externalId)) {
      result.skippedExisting += 1;
      continue;
    }
    batchSeen.add(externalId);
    const sub = (MOVE_SUBLIBRARIES as string[]).includes(m.sub_library ?? "")
      ? (m.sub_library as string)
      : classifyMoveSubLibrary({ title, description: (m.prep_notes ?? []).join(" "), activity_type: m.activity_type, vibe_keywords: m.vibe_keywords });
    rows.push({
      user_id: input.userId,
      external_id: externalId,
      source: "moves_generator",
      title,
      description: seq.map((s) => s.label).join(" → "),
      sub_library: sub,
      move_kind: m.move_kind ?? "self_directed",
      activity_type: m.activity_type ?? null,
      location_name: m.location_name ?? null,
      neighborhood: m.neighborhood ?? null,
      suggested_window: m.suggested_window ?? null,
      duration_minutes: typeof m.duration_minutes === "number" ? m.duration_minutes : null,
      price_hint: m.price_hint ?? null,
      booking_url: typeof m.booking_url === "string" && /^https?:\/\//i.test(m.booking_url) ? m.booking_url : null,
      sequence: seq,
      gear_needed: m.gear_needed ?? [],
      prep_notes: m.prep_notes ?? [],
      north_pillars: m.north_pillars ?? [],
      vibe_keywords: m.vibe_keywords ?? [],
      status: "discovered",
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("moves_items").insert(rows);
    if (error) result.errors.push(`insert: ${error.message}`);
    else result.added = rows.length;
  }
  return result;
}

async function generate(taste: AgentTaste, city: string, weather: string, rhythm: string, target: number): Promise<GenMove[]> {
  const system = [
    `You are Jerry's MOVES generator — a coach who looks at his life, energy, time, rhythm, weather, people, and taste, then produces CONCRETE, doable moves in ${city}.`,
    "A move is an ACTION with a real sequence — never 'be active' or 'go outside'.",
    "Cover variety across sub-libraries: moves_sports, moves_training, moves_outdoor, moves_social, moves_recovery, moves_creative, moves_skill, moves_lifestyle.",
    "Mix free/self-directed and paid/bookable. Be weather-aware, energy-aware, gear-aware. Tie to his real patterns (Logan Square base, Gold Coast drift, basketball, golf, cigars, camera, Sunday reset, Kamila, dad).",
    weather,
    rhythm,
    "For each move: a concrete sequence (1-4 steps), realistic duration, gear if needed, suggested window, and which North pillars it feeds (body/skill/creative/ownership/taste/relationships/peace).",
    `Return strict JSON: { "moves": [{ "title": string, "sub_library": string, "move_kind": "free"|"self_directed"|"paid"|"bookable"|"recurring"|"social"|"creative"|"recovery", "activity_type": string, "location_name": string|null, "neighborhood": string|null, "suggested_window": string, "duration_minutes": number, "price_hint": string|null, "sequence": [{ "label": string, "detail": string, "duration_minutes": number }], "gear_needed": string[], "prep_notes": string[], "north_pillars": string[], "vibe_keywords": string[] }] }`,
  ].join("\n");
  const prompt = [
    "Jerry's taste, pulled fresh:",
    buildAgentTasteBlock(taste),
    "",
    `Generate up to ${target} concrete moves spread across the sub-libraries. Only real, doable actions with a sequence.`,
  ].join("\n");

  const raw = await generateStructured<{ moves?: GenMove[] }>({
    system,
    prompt,
    schemaName: "moves_generate",
    temperature: 0.6,
    maxTokens: 4000,
  });
  return Array.isArray(raw?.moves) ? raw.moves.filter((m) => m && typeof m.title === "string") : [];
}
