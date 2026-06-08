import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { decayedScore, enforceRenderDiversity } from "@/lib/radar/engine/curation";
import type { Json, SurfacedItemInsert } from "@/lib/types/database";

/** Stage 23 — render the lane's top-N from the bench into surfaced_items so the
 *  existing board UI is unchanged (the "alongside bridge" in the plan). The
 *  engine owns one authoritative category per row; loadSurface trusts it and
 *  does NOT re-classify engine rows (that runtime re-guess was the old bug).
 *
 *  Idempotent + lifecycle-safe: respects user actions (never resurrects
 *  saved/planned/passed), and archives engine rows that fall off the shelf. */

export const RENDER_TOP_N = 7;
export const RENDER_SOURCE = "radar_engine";
const MAX_PER_SUBTYPE = 2;
const MAX_PER_NEIGHBORHOOD = 3;

export type RenderResult = {
  lane: string;
  benchConsidered: number;
  shown: number;
  inserted: number;
  archived: number;
  errors: string[];
};

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

type ExistingRow = { id: string; source_id: string | null; status: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function nbr(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function renderLaneFromBench(input: {
  userId: string;
  lane: string;
  supabase?: SupabaseClient;
  topN?: number;
}): Promise<RenderResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const topN = input.topN ?? RENDER_TOP_N;
  const result: RenderResult = {
    lane: input.lane,
    benchConsidered: 0,
    shown: 0,
    inserted: 0,
    archived: 0,
    errors: [],
  };

  // 1. Bench candidates (ready OR already shown — re-evaluated together each run).
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
  result.benchConsidered = bench.length;
  if (bench.length === 0) return result;

  // 2. Rank by live decayed score, then diversity-cap to topN.
  const now = new Date();
  const ranked = [...bench].sort(
    (a, b) => decayedScore(b.score, b.benched_at, now) - decayedScore(a.score, a.benched_at, now),
  );
  const winners = enforceRenderDiversity(ranked, {
    limit: topN,
    maxPerSubType: MAX_PER_SUBTYPE,
    maxPerNeighborhood: MAX_PER_NEIGHBORHOOD,
    subType: (r) => r.sub_type,
    neighborhood: (r) => r.neighborhood,
  });
  const winnerLibIds = new Set(winners.map((w) => w.radar_library_id));

  // 3. Enrichment data for the winners (image/address/verdict).
  const { data: libData, error: libErr } = await supabase
    .from("radar_library")
    .select("id, final_score, enrichment_data")
    .eq("user_id", input.userId)
    .in("id", [...winnerLibIds]);
  if (libErr) result.errors.push(`read library: ${libErr.message}`);
  const libById = new Map(((libData ?? []) as LibraryRow[]).map((r) => [r.id, r]));

  // 4. Existing engine surfaced_items for this lane (dedup + respect user actions).
  const { data: existData, error: existErr } = await supabase
    .from("surfaced_items")
    .select("id, source_id, status")
    .eq("user_id", input.userId)
    .eq("source", RENDER_SOURCE)
    .eq("category", input.lane);
  if (existErr) result.errors.push(`read existing: ${existErr.message}`);
  const existing = (existData ?? []) as ExistingRow[];
  const existingBySourceId = new Map(
    existing.filter((r) => r.source_id).map((r) => [r.source_id as string, r]),
  );
  // Actions we must never override or resurrect.
  const LOCKED = new Set(["saved", "planned", "passed", "completed"]);

  // 5. Upsert each winner.
  for (const w of winners) {
    const lib = libById.get(w.radar_library_id);
    const prior = existingBySourceId.get(w.radar_library_id);
    if (prior && LOCKED.has(prior.status)) {
      // User already acted — leave it, count as shown (still on the board in some form).
      continue;
    }
    const row = buildSurfacedRow(input.userId, input.lane, w, lib ?? null);
    if (prior) {
      const { error } = await supabase
        .from("surfaced_items")
        .update({ ...row, status: "shown" })
        .eq("id", prior.id)
        .eq("user_id", input.userId);
      if (error) result.errors.push(`update ${w.name}: ${error.message}`);
      else result.shown += 1;
    } else {
      const { error } = await supabase.from("surfaced_items").insert(row);
      if (error) result.errors.push(`insert ${w.name}: ${error.message}`);
      else {
        result.inserted += 1;
        result.shown += 1;
      }
    }
    // Mark the bench row shown.
    await supabase
      .from("radar_bench")
      .update({ status: "shown" })
      .eq("id", w.id)
      .eq("user_id", input.userId);
  }

  // 6. Archive engine rows that fell off the shelf (shown but no longer a winner,
  //    and not user-locked). Return their bench rows to 'ready' so they can come
  //    back later via decay/displacement.
  for (const ex of existing) {
    if (!ex.source_id) continue;
    if (winnerLibIds.has(ex.source_id)) continue;
    if (LOCKED.has(ex.status)) continue;
    if (ex.status === "archived") continue;
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
    status: "shown",
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
