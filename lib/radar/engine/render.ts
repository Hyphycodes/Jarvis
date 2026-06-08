import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { decayedScore, enforceRenderDiversity, normalizeExternalId } from "@/lib/radar/engine/curation";
import { radarItemReadyForFeature } from "@/lib/radar/engine/radarReadiness";
import { normalizeRadarCategory } from "@/lib/radar/category";
import type { Json, SurfacedItemInsert } from "@/lib/types/database";

/** Stage 23 — surface the lane's best venues, but ONLY once their plan is ready.
 *
 *  Two phases (the plans cron runs stage → build plans → show each cycle):
 *   - stageBenchToDiscovered: mirror the top bench pool into surfaced_items at
 *     status='discovered' (NOT visible — the board only reads 'shown'). This is
 *     where the plan-builder finds them. Also archives engine rows that fell off
 *     the bench pool.
 *   - promotePlanReadyToShown: flip to 'shown' ONLY the items whose plan is
 *     complete (payload.plan_status='ready'), top-N by score with diversity caps.
 *     A card therefore never reaches Radar with a half-built plan.
 *
 *  The engine owns one authoritative category per row; loadSurface trusts it and
 *  never re-classifies engine rows. Lifecycle-safe: never touches saved/passed. */

export const RENDER_TOP_N = 7;
export const RENDER_SOURCE = "radar_engine";
const STAGE_POOL = 14; // stage more than we show, so the plan-ready top-N has depth
const MAX_PER_SUBTYPE = 2;
const MAX_PER_NEIGHBORHOOD = 3;

// Statuses reflecting a user action — never override or resurrect these.
const LOCKED = new Set(["saved", "planned", "passed", "completed"]);

export type StageResult = { lane: string; pool: number; inserted: number; archived: number; errors: string[] };
export type ShowResult = { lane: string; planReady: number; shown: number; demoted: number; errors: string[] };

type BenchRow = {
  id: string;
  radar_library_id: string;
  name: string;
  sub_type: string | null;
  neighborhood: string | null;
  score: number;
  benched_at: string;
  status: string;
};

type LibraryRow = {
  id: string;
  final_score: number | null;
  enrichment_data: Record<string, unknown> | null;
};

type EngineItemRow = {
  id: string;
  source_id: string | null;
  status: string;
  destination: string | null;
  score: number | null;
  title: string | null;
  category: string | null;
  subtitle: string | null;
  image_url: string | null;
  payload: Record<string, unknown> | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function nbr(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Phase 1 — ensure the top bench pool exists as 'discovered' surfaced_items so
 *  the plan-builder can build their plans. Archives engine rows that fell off. */
export async function stageBenchToDiscovered(input: {
  userId: string;
  lane: string;
  supabase?: SupabaseClient;
  poolSize?: number;
}): Promise<StageResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const poolSize = input.poolSize ?? STAGE_POOL;
  const result: StageResult = { lane: input.lane, pool: 0, inserted: 0, archived: 0, errors: [] };

  const { data: benchData, error: benchErr } = await supabase
    .from("radar_bench")
    .select("id, radar_library_id, name, sub_type, neighborhood, score, benched_at, status")
    .eq("user_id", input.userId)
    .eq("lane", input.lane)
    .in("status", ["ready", "shown"]);
  if (benchErr) {
    result.errors.push(`read bench: ${benchErr.message}`);
    return result;
  }
  const bench = (benchData ?? []) as BenchRow[];
  if (bench.length === 0) return result;

  const libIds = [...new Set(bench.map((b) => b.radar_library_id))];
  const { data: libData, error: libErr } = await supabase
    .from("radar_library")
    .select("id, final_score, enrichment_data")
    .eq("user_id", input.userId)
    .in("id", libIds);
  if (libErr) result.errors.push(`read library: ${libErr.message}`);
  const libById = new Map(((libData ?? []) as LibraryRow[]).map((r) => [r.id, r]));

  const enrichOf = (b: BenchRow): Record<string, unknown> =>
    isRecord(libById.get(b.radar_library_id)?.enrichment_data)
      ? (libById.get(b.radar_library_id)!.enrichment_data as Record<string, unknown>)
      : {};
  const imageUrlFor = (b: BenchRow): string | null => str(enrichOf(b).image_url);
  const identityFor = (b: BenchRow): string => str(enrichOf(b).google_place_id) ?? normalizeExternalId(b.name);

  // Rank by decayed score; drop imageless; dedup by venue identity; cap to pool.
  const now = new Date();
  const seen = new Set<string>();
  const pool = [...bench]
    .sort((a, b) => decayedScore(b.score, b.benched_at, now) - decayedScore(a.score, a.benched_at, now))
    .filter((b) => imageUrlFor(b) !== null)
    .filter((b) => {
      const id = identityFor(b);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, poolSize);
  result.pool = pool.length;
  const poolLibIds = new Set(pool.map((p) => p.radar_library_id));

  const { data: existData, error: existErr } = await supabase
    .from("surfaced_items")
    .select("id, source_id, status")
    .eq("user_id", input.userId)
    .eq("source", RENDER_SOURCE)
    .eq("category", input.lane);
  if (existErr) result.errors.push(`read existing: ${existErr.message}`);
  const existing = (existData ?? []) as EngineItemRow[];
  const existingIds = new Set(existing.filter((r) => r.source_id).map((r) => r.source_id as string));

  // Insert new pool members as 'discovered' (the plan-builder picks them up).
  for (const b of pool) {
    if (existingIds.has(b.radar_library_id)) continue;
    const row = buildSurfacedRow(input.userId, input.lane, b, libById.get(b.radar_library_id) ?? null);
    const { error } = await supabase.from("surfaced_items").insert(row);
    if (error) result.errors.push(`stage ${b.name}: ${error.message}`);
    else result.inserted += 1;
  }

  // Archive engine rows that fell off the bench pool (not user-locked).
  for (const ex of existing) {
    if (!ex.source_id || poolLibIds.has(ex.source_id)) continue;
    if (LOCKED.has(ex.status) || ex.status === "archived") continue;
    const { error } = await supabase
      .from("surfaced_items")
      .update({ status: "archived" })
      .eq("id", ex.id)
      .eq("user_id", input.userId);
    if (error) result.errors.push(`archive ${ex.source_id}: ${error.message}`);
    else result.archived += 1;
    await supabase
      .from("radar_bench")
      .update({ status: "ready" })
      .eq("user_id", input.userId)
      .eq("radar_library_id", ex.source_id)
      .eq("status", "shown");
  }

  return result;
}

/** Phase 2 — flip to 'shown' ONLY the staged engine items whose plan is complete,
 *  top-N by score with diversity. Demotes non-winners back to 'discovered'. */
export async function promotePlanReadyToShown(input: {
  userId: string;
  lane: string;
  supabase?: SupabaseClient;
  topN?: number;
}): Promise<ShowResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const topN = input.topN ?? RENDER_TOP_N;
  const result: ShowResult = { lane: input.lane, planReady: 0, shown: 0, demoted: 0, errors: [] };

  const { data, error } = await supabase
    .from("surfaced_items")
    .select("id, source_id, status, destination, score, title, category, subtitle, image_url, payload")
    .eq("user_id", input.userId)
    .eq("source", RENDER_SOURCE)
    .eq("category", input.lane)
    .in("status", ["discovered", "shown"]);
  if (error) {
    result.errors.push(`read staged: ${error.message}`);
    return result;
  }
  const items = (data ?? []) as EngineItemRow[];

  const isPlanReady = (it: EngineItemRow): boolean => {
    const p = isRecord(it.payload) ? it.payload : {};
    return p.plan_status === "ready" && typeof p.plan_slug === "string" && p.plan_slug.length > 0;
  };
  const subTypeOf = (it: EngineItemRow): string | null => {
    const p = isRecord(it.payload) ? it.payload : {};
    return str(p.sub_type);
  };

  // Final readiness contract: even a plan-ready row may not feature if its card
  // or image isn't complete. The engine promotes only complete items; the rest
  // stay 'discovered' for enrichment (the materializer back-fills images there).
  const ready = items.filter(
    (it) => isPlanReady(it) && !LOCKED.has(it.status) && passesEngineContract(it),
  );
  result.planReady = ready.length;

  const ranked = [...ready].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const winners = enforceRenderDiversity(ranked, {
    limit: topN,
    maxPerSubType: MAX_PER_SUBTYPE,
    maxPerNeighborhood: MAX_PER_NEIGHBORHOOD,
    subType: subTypeOf,
    neighborhood: (it) => it.subtitle,
  });
  const winnerIds = new Set(winners.map((w) => w.id));

  for (const w of winners) {
    // Already live on the board? Only skip when BOTH the status and destination
    // are right. The board reads (destination='radar' AND status='shown'), so a
    // winner stuck on destination='holding' must be pulled back to radar — else
    // it stays invisible while occupying a winner slot and starves the lane.
    if (w.status === "shown" && w.destination === "radar") continue;
    const { error: upErr } = await supabase
      .from("surfaced_items")
      .update({ status: "shown", destination: "radar" })
      .eq("id", w.id)
      .eq("user_id", input.userId);
    if (upErr) result.errors.push(`show ${w.id}: ${upErr.message}`);
    else result.shown += 1;
  }

  // Demote currently-shown items that aren't winners (lost their slot or their
  // plan) back to 'discovered' — off the board, still in the pool.
  for (const it of items) {
    if (it.status !== "shown" || winnerIds.has(it.id) || LOCKED.has(it.status)) continue;
    const { error: dErr } = await supabase
      .from("surfaced_items")
      .update({ status: "discovered" })
      .eq("id", it.id)
      .eq("user_id", input.userId);
    if (dErr) result.errors.push(`demote ${it.id}: ${dErr.message}`);
    else result.demoted += 1;
  }

  return result;
}

/** The Radar Readiness Contract at the engine promote step. Plan readiness is
 *  already established by isPlanReady; this adds the rest of the contract — a
 *  real image, and (for events) a real date+venue — so the engine never marks an
 *  incomplete row 'shown'. Card basics fall back to guaranteed columns so this
 *  only ever holds on genuinely-missing facts. */
function passesEngineContract(it: EngineItemRow): boolean {
  const lane = normalizeRadarCategory(it.category);
  if (!lane) return false;
  const p = isRecord(it.payload) ? it.payload : {};
  const brief = isRecord(p.brief) ? p.brief : {};
  const imageUrl = str(it.image_url) ?? str(brief.hero_image_url) ?? str(p.image_url);
  const hasPlanRef = typeof p.plan_slug === "string" && p.plan_slug.length > 0;
  return radarItemReadyForFeature({
    lane,
    title: str(it.title),
    description: str(brief.jarvis_line) ?? str(it.title),
    score: it.score ?? 0,
    imageUrl,
    hasPlanRef,
    planReady: true, // caller already filtered isPlanReady
    findsReady: lane === "finds" ? Boolean(p.finds) : undefined,
    startsAt: str(p.official_starts_at),
    venue: str(it.subtitle),
    location: str(it.subtitle),
  }).ready;
}

function buildSurfacedRow(
  userId: string,
  lane: string,
  bench: BenchRow,
  lib: LibraryRow | null,
): SurfacedItemInsert {
  const enrich = isRecord(lib?.enrichment_data) ? lib!.enrichment_data : {};
  const council = isRecord(enrich.council) ? enrich.council : {};
  const verdict = str(council.verdict);
  const imageUrl = str(enrich.image_url);
  const address = str(enrich.address);
  const lat = nbr(enrich.lat);
  const lng = nbr(enrich.lng);
  const score = lib?.final_score ?? bench.score ?? null;

  // The card reads payload.brief.jarvis_line as its editorial voice and
  // payload.brief.hero_image_url for the image — feed the council verdict there
  // so engine cards read in Jarvis's voice without a separate brief-gen pass.
  const payload: Json = {
    source_layer: "radar_engine",
    sub_type: bench.sub_type,
    radar_library_id: bench.radar_library_id,
    price_level: str(enrich.price_level),
    cuisine: str(enrich.cuisine),
    hours: str(enrich.hours),
    reservation_required: typeof enrich.reservation_required === "boolean" ? enrich.reservation_required : null,
    council: council as Json,
    brief: {
      jarvis_line: verdict,
      hero_image_url: imageUrl,
    },
  };

  return {
    user_id: userId,
    destination: "radar",
    // Staged out of sight; promotePlanReadyToShown flips to 'shown' once planned.
    status: "discovered",
    source: RENDER_SOURCE,
    source_id: bench.radar_library_id,
    type: "restaurant",
    category: lane,
    title: bench.name,
    subtitle: bench.neighborhood ?? null,
    description: verdict,
    location_name: bench.name,
    address,
    lat,
    lng,
    url: null,
    image_url: imageUrl,
    score,
    taste_fit_summary: verdict,
    reasons: [],
    tags: bench.sub_type ? [bench.sub_type] : [],
    payload,
  };
}
