import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { ENGINE_SOURCE } from "@/lib/radar/engine/ownership";
import { pillarsForItem } from "@/lib/radar/engine/pillars";
import { readOperatingPreferences } from "@/lib/operating/readOperatingPreferences";
import { buildBrainContext } from "@/lib/brain/context";
import { generateMoves } from "@/lib/radar/engine/moves/generator";
import { runMovesCouncil } from "@/lib/radar/engine/moves/council";
import { selectMovesShelf, type MoveShelfCandidate } from "@/lib/radar/engine/moves/editor";
import {
  assessMoveTruth,
  assessMoveFit,
  assessEnergy,
  assessWeather,
  assessMovePlanability,
  type AssessableMove,
} from "@/lib/radar/engine/moves/assess";
import { classifyMoveSubLibrary } from "@/lib/radar/engine/moves/config";
import type { MovesItemRow, Json } from "@/lib/types/database";

/**
 * Moves lane engine — the fifth lane (per jarvis-moves-engine-brain-tree.md).
 * Warehouse = moves_items. Moves are GENERATED (not scouted), EVERGREEN, with
 * Energy + Weather brains. Stable shelf; low-friction high-fit moves route to Today.
 *
 *   generate → assess (Truth/Fit/Energy/Weather/Planability) → council (LLM) →
 *   comparative → editor+render engine-owned → Today routing.
 */

const GEN_TARGET = 14;
const GEN_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FEATURED_TARGET = 7;
const TODAY_SCORE_FLOOR = 0.62;
const LOCKED_STATUSES = ["saved", "planned", "passed", "completed"];
const LOCKED_OR_ARCHIVED = new Set<string>([...LOCKED_STATUSES, "archived"]);

export type MovesEngineResult = {
  generated: number;
  assessed: number;
  judged: number;
  rejected: number;
  rendered: number;
  demoted: number;
  routedToToday: number;
  backfilled: number;
  errors: string[];
};

export async function runMovesEngine(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<MovesEngineResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const result: MovesEngineResult = { generated: 0, assessed: 0, judged: 0, rejected: 0, rendered: 0, demoted: 0, routedToToday: 0, backfilled: 0, errors: [] };

  result.backfilled = await backfillEngineOwnership(supabase, input.userId);

  const ready = await countReady(supabase, input.userId);
  if (ready < GEN_TARGET && (await genCooledDown(supabase, input.userId))) {
    try {
      const gen = await generateMoves({ userId: input.userId, supabase });
      result.generated = gen.added;
      if (gen.errors.length) result.errors.push(...gen.errors);
    } catch (err) {
      result.errors.push(`generate: ${msg(err)}`);
    }
  }

  // Context for deterministic fit/weather (operating mode, weather, rhythm).
  let weatherBad: boolean | null = null;
  let operatingMode: string | null = null;
  let lowFrictionWeeknights = false;
  try {
    const brain = await buildBrainContext({ userId: input.userId, includeWeather: true, supabase });
    operatingMode = brain.operating?.operatingMode ?? null;
    lowFrictionWeeknights = Boolean(brain.operating?.lowFrictionWeeknights);
    if (brain.weather) weatherBad = isBadWeather(brain.weather);
  } catch {
    // best-effort
  }

  try {
    result.assessed = await assessMoveItems(supabase, input.userId, { weatherBad, operatingMode, lowFrictionWeeknights });
  } catch (err) {
    result.errors.push(`assess: ${msg(err)}`);
  }

  try {
    const council = await runMovesCouncil({ userId: input.userId, supabase });
    result.judged = council.reduce((a, r) => a + r.judged, 0);
    result.rejected = council.reduce((a, r) => a + r.rejected, 0);
    for (const r of council) if (r.errors.length) result.errors.push(...r.errors);
  } catch (err) {
    result.errors.push(`council: ${msg(err)}`);
  }

  try {
    await rankComparative(supabase, input.userId);
  } catch (err) {
    result.errors.push(`comparative: ${msg(err)}`);
  }

  try {
    const shelf = await renderMovesShelf(supabase, input.userId);
    result.rendered = shelf.rendered;
    result.demoted = shelf.demoted;
  } catch (err) {
    result.errors.push(`render: ${msg(err)}`);
  }

  try {
    result.routedToToday = await routeLowFrictionToToday(supabase, input.userId);
  } catch (err) {
    result.errors.push(`today: ${msg(err)}`);
  }

  return result;
}

async function assessMoveItems(
  supabase: SupabaseClient,
  userId: string,
  ctx: { weatherBad: boolean | null; operatingMode: string | null; lowFrictionWeeknights: boolean },
): Promise<number> {
  const { data, error } = await supabase
    .from("moves_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "discovered")
    .limit(80);
  if (error || !data) return 0;
  await readOperatingPreferences(supabase, userId).catch(() => null);
  const now = new Date();
  let assessed = 0;
  for (const row of data as MovesItemRow[]) {
    const m: AssessableMove = {
      title: row.title,
      sub_library: row.sub_library,
      move_kind: row.move_kind,
      activity_type: row.activity_type,
      sequence: row.sequence,
      gear_needed: row.gear_needed,
      booking_url: row.booking_url,
      source_url: row.source_url,
      location_name: row.location_name,
      duration_minutes: row.duration_minutes,
      price_hint: row.price_hint,
      vibe_keywords: row.vibe_keywords,
    };
    const truth = assessMoveTruth(m);
    const energy = assessEnergy(m);
    const weather = assessWeather(m, { weatherBad: ctx.weatherBad });
    const fit = assessMoveFit(m, { now, weatherBad: ctx.weatherBad, operatingMode: ctx.operatingMode, lowFrictionWeeknights: ctx.lowFrictionWeeknights });
    const planability = assessMovePlanability(m);
    const subLibrary = row.sub_library ?? classifyMoveSubLibrary({ title: row.title, description: row.description, activity_type: row.activity_type, vibe_keywords: row.vibe_keywords });
    const pre_score = clamp01(0.4 * truth.action_confidence + 0.6 * fit.fit_score);
    const { error: upErr } = await supabase
      .from("moves_items")
      .update({
        sub_library: subLibrary,
        truth_assessment: truth as unknown as Json,
        fit_assessment: fit as unknown as Json,
        energy_assessment: energy as unknown as Json,
        weather_assessment: weather as unknown as Json,
        planability_assessment: planability as unknown as Json,
        pre_score,
        last_seen_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (!upErr) assessed += 1;
  }
  return assessed;
}

async function rankComparative(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data } = await supabase
    .from("moves_items")
    .select("id, sub_library, final_score")
    .eq("user_id", userId)
    .eq("status", "discovered")
    .not("final_score", "is", null);
  const rows = (data ?? []) as Array<{ id: string; sub_library: string | null; final_score: number | null }>;
  const bySub = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.sub_library ?? "unknown";
    const list = bySub.get(k) ?? [];
    list.push(r);
    bySub.set(k, list);
  }
  for (const list of bySub.values()) {
    list.sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));
    for (let i = 0; i < list.length; i++) {
      await supabase.from("moves_items").update({ comparative_rank: i + 1 }).eq("id", list[i].id).eq("user_id", userId);
    }
  }
}

async function renderMovesShelf(supabase: SupabaseClient, userId: string): Promise<{ rendered: number; demoted: number }> {
  const { data, error } = await supabase
    .from("moves_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "discovered")
    .not("final_score", "is", null)
    .limit(80);
  if (error || !data) return { rendered: 0, demoted: 0 };
  const items = (data as MovesItemRow[]).filter((m) => Boolean(m.title?.trim()) && Array.isArray(m.sequence) && (m.sequence as unknown[]).length > 0);

  const candidates: Array<MoveShelfCandidate & { item: MovesItemRow }> = items.map((m) => ({
    id: m.id,
    sub_library: m.sub_library,
    energy_required: energyRequired(m.energy_assessment),
    final_score: m.final_score,
    item: m,
  }));
  const { featured } = selectMovesShelf(candidates, { limit: FEATURED_TARGET, maxPerSubLibrary: 2, maxPerEnergy: 4 });
  const featuredIds = new Set(featured.map((f) => f.id));

  const { data: cardRows } = await supabase
    .from("surfaced_items")
    .select("id, source_id, status, payload")
    .eq("user_id", userId)
    .eq("category", "moves");
  const cardsByItem = new Map<string, ExistingCard[]>();
  for (const row of (cardRows ?? []) as ExistingCard[]) {
    if (!row.source_id) continue;
    const list = cardsByItem.get(row.source_id) ?? [];
    list.push(row);
    cardsByItem.set(row.source_id, list);
  }

  let rendered = 0;
  for (const f of featured) {
    const m = f.item;
    const cards = cardsByItem.get(m.id) ?? [];
    if (cards.some((x) => LOCKED_OR_ARCHIVED.has(x.status))) continue;
    const live = cards.find((x) => x.status === "shown" || x.status === "discovered");
    if (live) {
      const payload = isRecord(live.payload) ? live.payload : {};
      const { error: upErr } = await supabase
        .from("surfaced_items")
        .update({ status: "shown", destination: "radar", score: m.final_score ?? null, payload: { ...payload, ...movePayload(m), source_layer: ENGINE_SOURCE } })
        .eq("id", live.id)
        .eq("user_id", userId);
      if (!upErr) rendered += 1;
      continue;
    }
    if (cards.length > 0) continue;
    const { error: insErr } = await supabase.from("surfaced_items").insert(buildMoveCard(userId, m));
    if (!insErr) rendered += 1;
  }

  let demoted = 0;
  for (const [itemId, cards] of cardsByItem) {
    if (featuredIds.has(itemId)) continue;
    for (const x of cards) {
      if (x.status !== "shown" || LOCKED_OR_ARCHIVED.has(x.status)) continue;
      if (!isRecord(x.payload) || x.payload.source_layer !== ENGINE_SOURCE) continue;
      const { error: dErr } = await supabase.from("surfaced_items").update({ status: "discovered" }).eq("id", x.id).eq("user_id", userId);
      if (!dErr) demoted += 1;
    }
  }
  return { rendered, demoted };
}

/** Low-friction, high-fit moves can appear on Today. */
async function routeLowFrictionToToday(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from("surfaced_items")
    .select("id, score, payload")
    .eq("user_id", userId)
    .eq("category", "moves")
    .eq("status", "shown")
    .eq("destination", "radar");
  let routed = 0;
  for (const row of (data ?? []) as Array<{ id: string; score: number | null; payload: unknown }>) {
    if ((row.score ?? 0) < TODAY_SCORE_FLOOR) continue;
    const p = isRecord(row.payload) ? row.payload : {};
    const fit = isRecord(p.fit_assessment) ? p.fit_assessment : {};
    if (fit.timing_fit !== "today" || fit.friction_level === "high") continue;
    const { error } = await supabase
      .from("surfaced_items")
      .update({ destination: "today" })
      .eq("id", row.id)
      .eq("user_id", userId)
      .not("status", "in", `(${LOCKED_STATUSES.join(",")})`);
    if (!error) routed += 1;
  }
  return routed;
}

function movePayload(m: MovesItemRow): Record<string, unknown> {
  return {
    move_id: m.id,
    sub_library: m.sub_library,
    move_kind: m.move_kind,
    suggested_window: m.suggested_window,
    duration_minutes: m.duration_minutes,
    sequence: m.sequence,
    gear_needed: m.gear_needed,
    energy_assessment: m.energy_assessment,
    fit_assessment: m.fit_assessment,
    weather_assessment: m.weather_assessment,
    pillar_tags: pillarsForItem({ category: "moves", lane: "moves", tags: m.vibe_keywords ?? [], title: m.title }),
    brief: { jarvis_line: m.verdict ?? m.description },
  };
}

function buildMoveCard(userId: string, m: MovesItemRow): Record<string, unknown> {
  return {
    user_id: userId,
    destination: "radar",
    source: "moves_engine",
    source_id: m.id,
    title: m.title,
    subtitle: m.suggested_window ?? m.location_name ?? null,
    description: m.verdict ?? m.description ?? null,
    location_name: m.location_name ?? null,
    url: m.booking_url ?? m.source_url ?? null,
    type: "move",
    category: "moves",
    tags: m.vibe_keywords ?? [],
    reasons: [m.verdict ?? "", m.description ?? ""].filter(Boolean),
    score: m.final_score ?? m.verdict_strength ?? null,
    taste_fit_summary: m.verdict ?? null,
    status: "shown",
    payload: { source_layer: ENGINE_SOURCE, ...movePayload(m) } as Json,
  };
}

async function backfillEngineOwnership(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("surfaced_items")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("category", "moves")
    .neq("source", "library_materializer")
    .in("status", ["shown", "discovered", "opened", "saved", "planned"]);
  if (error || !data) return 0;
  let count = 0;
  for (const row of data as Array<{ id: string; payload: unknown }>) {
    const payload = isRecord(row.payload) ? row.payload : {};
    if (payload.source_layer === ENGINE_SOURCE) continue;
    const { error: upErr } = await supabase.from("surfaced_items").update({ payload: { ...payload, source_layer: ENGINE_SOURCE } }).eq("id", row.id).eq("user_id", userId);
    if (!upErr) count += 1;
  }
  return count;
}

async function countReady(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from("moves_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "discovered");
  return count ?? 0;
}

async function genCooledDown(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("moves_items")
    .select("first_seen_at")
    .eq("user_id", userId)
    .order("first_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = (data as { first_seen_at: string | null } | null)?.first_seen_at;
  if (!last) return true;
  const t = new Date(last).getTime();
  return !Number.isFinite(t) || Date.now() - t > GEN_MIN_INTERVAL_MS;
}

function isBadWeather(w: { temperatureF: number; windMph: number; weatherCode: number }): boolean {
  // WMO codes ≥ 51 = drizzle/rain/snow/storm; or harsh temp/wind.
  return w.weatherCode >= 51 || w.temperatureF < 25 || w.temperatureF > 96 || w.windMph > 28;
}

type ExistingCard = { id: string; source_id: string | null; status: string; payload: unknown };

function energyRequired(a: unknown): string | null {
  return isRecord(a) && typeof a.energy_required === "string" ? a.energy_required : null;
}
function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
