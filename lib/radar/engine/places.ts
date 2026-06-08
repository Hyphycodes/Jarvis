import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { ENGINE_SOURCE } from "@/lib/radar/engine/ownership";
import { pillarsForItem } from "@/lib/radar/engine/pillars";
import { readOperatingPreferences } from "@/lib/operating/readOperatingPreferences";
import { seedPlacesFromLibrary } from "@/lib/radar/engine/places/scout";
import { runPlacesCouncil } from "@/lib/radar/engine/places/council";
import { selectPlacesShelf, type PlaceShelfCandidate } from "@/lib/radar/engine/places/editor";
import {
  assessPlaceTruth,
  assessRole,
  assessPlaceFit,
  assessPlacePlanability,
  type AssessablePlace,
} from "@/lib/radar/engine/places/assess";
import { classifyPlaceSubLibrary } from "@/lib/radar/engine/places/config";
import type { PlacesItemRow, Json } from "@/lib/types/database";

/**
 * Places lane engine — the fourth lane (per jarvis-places-engine-brain-tree.md).
 * Warehouse = places_items, seeded from places_library's place-category rows. Places
 * are EVERGREEN (no expiration) with a ROLE brain. Mirrors the culture engine minus
 * expiration; stable featured shelf (no auto-churn).
 *
 *   seed → assess (Truth/Role/Fit/Planability) → council (LLM finalists) →
 *   comparative → editor+render engine-owned shelf.
 *
 * Cutover: places in ENGINE_OWNED_LANES (old materializer yields). Locked/passed/
 * archived rows untouched.
 */

const FEATURED_TARGET = 7;
const LOCKED_STATUSES = ["saved", "planned", "passed", "completed"];
const LOCKED_OR_ARCHIVED = new Set<string>([...LOCKED_STATUSES, "archived"]);

export type PlacesEngineResult = {
  seeded: number;
  assessed: number;
  judged: number;
  rejected: number;
  rendered: number;
  demoted: number;
  backfilled: number;
  errors: string[];
};

export async function runPlacesEngine(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<PlacesEngineResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const result: PlacesEngineResult = { seeded: 0, assessed: 0, judged: 0, rejected: 0, rendered: 0, demoted: 0, backfilled: 0, errors: [] };

  result.backfilled = await backfillEngineOwnership(supabase, input.userId);

  try {
    const seed = await seedPlacesFromLibrary({ userId: input.userId, supabase });
    result.seeded = seed.added;
  } catch (err) {
    result.errors.push(`seed: ${msg(err)}`);
  }

  try {
    result.assessed = await assessPlaceItems(supabase, input.userId);
  } catch (err) {
    result.errors.push(`assess: ${msg(err)}`);
  }

  try {
    const council = await runPlacesCouncil({ userId: input.userId, supabase });
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
    const shelf = await renderPlacesShelf(supabase, input.userId);
    result.rendered = shelf.rendered;
    result.demoted = shelf.demoted;
  } catch (err) {
    result.errors.push(`render: ${msg(err)}`);
  }

  return result;
}

async function assessPlaceItems(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("places_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "discovered")
    .limit(80);
  if (error || !data) return 0;
  await readOperatingPreferences(supabase, userId).catch(() => null); // (reserved for future spend-aware fit)
  let assessed = 0;
  const now = new Date();
  for (const row of data as PlacesItemRow[]) {
    const p: AssessablePlace = {
      title: row.title,
      place_type: row.place_type,
      sub_library: row.sub_library,
      description: row.description,
      neighborhood: row.neighborhood,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      google_place_id: row.google_place_id,
      source_url: row.source_url,
      image_url: row.image_url,
      vibe_keywords: row.vibe_keywords,
      best_for: row.best_for,
      verdict_strength: row.verdict_strength,
    };
    const truth = assessPlaceTruth(p);
    const role = assessRole(p);
    const fit = assessPlaceFit(p, { now });
    const planability = assessPlacePlanability(p);
    const subLibrary = row.sub_library ?? classifyPlaceSubLibrary({ title: row.title, place_type: row.place_type, description: row.description, vibe_keywords: row.vibe_keywords });
    const pre_score = clamp01(0.4 * truth.exists_confidence + 0.3 * fit.fit_score + 0.3 * clamp01(row.verdict_strength ?? 0.5));
    const { error: upErr } = await supabase
      .from("places_items")
      .update({
        sub_library: subLibrary,
        primary_role: role.primary_role,
        secondary_roles: role.secondary_roles as unknown as Json,
        best_use_case: role.best_use_case,
        truth_assessment: truth as unknown as Json,
        role_assessment: role as unknown as Json,
        fit_assessment: fit as unknown as Json,
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
    .from("places_items")
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
      await supabase.from("places_items").update({ comparative_rank: i + 1 }).eq("id", list[i].id).eq("user_id", userId);
    }
  }
}

async function renderPlacesShelf(supabase: SupabaseClient, userId: string): Promise<{ rendered: number; demoted: number }> {
  const { data, error } = await supabase
    .from("places_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "discovered")
    .not("final_score", "is", null)
    .limit(80);
  if (error || !data) return { rendered: 0, demoted: 0 };
  const items = (data as PlacesItemRow[]).filter((p) => Boolean(p.title?.trim()) && (Boolean(p.neighborhood) || Boolean(p.address) || typeof p.lat === "number"));

  const candidates: Array<PlaceShelfCandidate & { item: PlacesItemRow }> = items.map((p) => ({
    id: p.id,
    sub_library: p.sub_library,
    neighborhood: p.neighborhood,
    primary_role: p.primary_role,
    final_score: p.final_score,
    item: p,
  }));
  const { featured } = selectPlacesShelf(candidates, { limit: FEATURED_TARGET, maxPerSubLibrary: 3, maxPerNeighborhood: 2, maxPerRole: 2 });
  const featuredIds = new Set(featured.map((f) => f.id));

  const { data: cardRows } = await supabase
    .from("surfaced_items")
    .select("id, source_id, status, payload")
    .eq("user_id", userId)
    .eq("category", "places");
  const cardsByItem = new Map<string, ExistingCard[]>();
  for (const row of (cardRows ?? []) as ExistingCard[]) {
    if (!row.source_id) continue;
    const list = cardsByItem.get(row.source_id) ?? [];
    list.push(row);
    cardsByItem.set(row.source_id, list);
  }

  let rendered = 0;
  for (const f of featured) {
    const p = f.item;
    const cards = cardsByItem.get(p.id) ?? [];
    if (cards.some((x) => LOCKED_OR_ARCHIVED.has(x.status))) continue;
    const live = cards.find((x) => x.status === "shown" || x.status === "discovered");
    if (live) {
      const payload = isRecord(live.payload) ? live.payload : {};
      const { error: upErr } = await supabase
        .from("surfaced_items")
        .update({ status: "shown", destination: "radar", score: p.final_score ?? null, payload: { ...payload, ...placePayload(p), source_layer: ENGINE_SOURCE } })
        .eq("id", live.id)
        .eq("user_id", userId);
      if (!upErr) rendered += 1;
      continue;
    }
    if (cards.length > 0) continue;
    const { error: insErr } = await supabase.from("surfaced_items").insert(buildPlaceCard(userId, p));
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

function placePayload(p: PlacesItemRow): Record<string, unknown> {
  return {
    place_id: p.id,
    sub_library: p.sub_library,
    primary_role: p.primary_role,
    best_use_case: p.best_use_case,
    neighborhood: p.neighborhood,
    pillar_tags: pillarsForItem({ category: "places", lane: "places", tags: p.vibe_keywords ?? [], title: p.title }),
    brief: { jarvis_line: p.verdict ?? p.description, hero_image_url: p.image_url },
  };
}

function buildPlaceCard(userId: string, p: PlacesItemRow): Record<string, unknown> {
  return {
    user_id: userId,
    destination: "radar",
    source: "places_engine",
    source_id: p.id,
    title: p.title,
    subtitle: p.neighborhood ?? null,
    description: p.verdict ?? p.description ?? null,
    location_name: p.title,
    address: p.address ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    url: p.source_url ?? null,
    type: "place",
    category: "places",
    tags: p.vibe_keywords ?? [],
    reasons: [p.best_use_case ?? "", p.verdict ?? ""].filter(Boolean),
    score: p.final_score ?? p.verdict_strength ?? null,
    image_url: p.image_url ?? null,
    taste_fit_summary: p.verdict ?? null,
    status: "shown",
    payload: { source_layer: ENGINE_SOURCE, ...placePayload(p) } as Json,
  };
}

async function backfillEngineOwnership(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("surfaced_items")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("category", "places")
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

type ExistingCard = { id: string; source_id: string | null; status: string; payload: unknown };

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
