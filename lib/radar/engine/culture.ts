import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { ENGINE_SOURCE } from "@/lib/radar/engine/ownership";
import { pillarsForItem } from "@/lib/radar/engine/pillars";
import { readOperatingPreferences } from "@/lib/operating/readOperatingPreferences";
import { scoutCulture } from "@/lib/radar/engine/culture/scout";
import { runCultureCouncil } from "@/lib/radar/engine/culture/council";
import { selectCultureShelf, type CultureShelfCandidate } from "@/lib/radar/engine/culture/editor";
import {
  assessCultureTruth,
  assessDepth,
  assessCultureFit,
  assessCulturePlanability,
  cultureExpiresAt,
  type AssessableCulture,
} from "@/lib/radar/engine/culture/assess";
import { classifyCultureSubLibrary } from "@/lib/radar/engine/culture/config";
import type { CultureItemRow, Json } from "@/lib/types/database";

/**
 * Culture lane engine — the third lane engine (per jarvis-culture-engine-brain-tree.md).
 * Warehouse = culture_items (timeless-friendly). Mirrors the Events engine but with a
 * DEPTH layer and timeless handling (timeless culture never expires; only dated does).
 *
 *   scout → assess (Truth/Depth/Fit/Planability) → council (LLM finalists) →
 *   comparative → editor+render (engine-owned shelf) → expire dated only.
 *
 * Additive + cutover-safe: culture is added to ENGINE_OWNED_LANES so the old
 * materializer yields; locked/passed/archived rows are never touched.
 */

const SCOUT_TARGET = 14; // ready/reserve culture pool to keep warm
const SCOUT_MIN_INTERVAL_MS = 8 * 60 * 60 * 1000;
const FEATURED_TARGET = 7;
const LOCKED_STATUSES = ["saved", "planned", "passed", "completed"];
const LOCKED_OR_ARCHIVED = new Set<string>([...LOCKED_STATUSES, "archived"]);

export type CultureEngineResult = {
  scouted: number;
  assessed: number;
  judged: number;
  rejected: number;
  expiredItems: number;
  archivedCards: number;
  rendered: number;
  demoted: number;
  backfilled: number;
  errors: string[];
};

export async function runCultureEngine(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<CultureEngineResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const result: CultureEngineResult = {
    scouted: 0, assessed: 0, judged: 0, rejected: 0,
    expiredItems: 0, archivedCards: 0, rendered: 0, demoted: 0, backfilled: 0, errors: [],
  };

  result.backfilled = await backfillEngineOwnership(supabase, input.userId);

  const expired = await expireDatedCulture(supabase, input.userId);
  result.expiredItems = expired.items;
  result.archivedCards = expired.cards;

  // Scout when the pool is thin + cooled down.
  const ready = await countReady(supabase, input.userId);
  if (ready < SCOUT_TARGET && (await scoutCooledDown(supabase, input.userId))) {
    try {
      const s = await scoutCulture({ userId: input.userId, supabase });
      result.scouted = s.reduce((a, r) => a + r.added, 0);
      for (const r of s) if (r.errors.length) result.errors.push(...r.errors);
    } catch (err) {
      result.errors.push(`scout: ${msg(err)}`);
    }
  }

  try {
    result.assessed = await assessCultureItems(supabase, input.userId);
  } catch (err) {
    result.errors.push(`assess: ${msg(err)}`);
  }

  try {
    const council = await runCultureCouncil({ userId: input.userId, supabase });
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
    const shelf = await renderCultureShelf(supabase, input.userId);
    result.rendered = shelf.rendered;
    result.demoted = shelf.demoted;
  } catch (err) {
    result.errors.push(`render: ${msg(err)}`);
  }

  return result;
}

/** Deterministic brain layer over discovered culture items. */
async function assessCultureItems(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("culture_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "discovered")
    .limit(60);
  if (error || !data) return 0;
  const prefs = await readOperatingPreferences(supabase, userId).catch(() => null);
  const now = new Date();
  let assessed = 0;
  for (const row of data as CultureItemRow[]) {
    const c: AssessableCulture = {
      title: row.title,
      description: row.description,
      venue_name: row.venue_name,
      institution_name: row.institution_name,
      source_url: row.source_url,
      discovered_via: row.discovered_via,
      is_dated: row.is_dated,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      admission_price_min: row.admission_price_min,
      admission_price_max: row.admission_price_max,
      vibe_keywords: row.vibe_keywords,
      verdict_strength: row.verdict_strength,
    };
    const truth = assessCultureTruth(c);
    const depth = assessDepth(c);
    const fit = assessCultureFit(c, { now, premiumThreshold: prefs?.premiumThreshold ?? null });
    const planability = assessCulturePlanability(c);
    const subLibrary = row.sub_library ?? classifyCultureSubLibrary({
      title: row.title, description: row.description, venue_name: row.venue_name, institution_name: row.institution_name,
    });
    const pre_score = clamp01(0.4 * truth.exists_confidence + 0.4 * depth.depth_score + 0.2 * fit.fit_score);
    const { error: upErr } = await supabase
      .from("culture_items")
      .update({
        sub_library: subLibrary,
        truth_assessment: truth as unknown as Json,
        depth_assessment: depth as unknown as Json,
        fit_assessment: fit as unknown as Json,
        planability_assessment: planability as unknown as Json,
        pre_score,
        expires_at: cultureExpiresAt(c),
        last_seen_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (!upErr) assessed += 1;
  }
  return assessed;
}

/** Deterministic comparative rank within each sub-library by final_score + depth. */
async function rankComparative(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data } = await supabase
    .from("culture_items")
    .select("id, sub_library, final_score, depth_assessment")
    .eq("user_id", userId)
    .eq("status", "discovered")
    .not("final_score", "is", null);
  const rows = (data ?? []) as Array<{ id: string; sub_library: string | null; final_score: number | null; depth_assessment: unknown }>;
  const bySub = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.sub_library ?? "unknown";
    const list = bySub.get(k) ?? [];
    list.push(r);
    bySub.set(k, list);
  }
  for (const list of bySub.values()) {
    list.sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0) + (depthScore(b.depth_assessment) - depthScore(a.depth_assessment)) * 0.1);
    for (let i = 0; i < list.length; i++) {
      await supabase.from("culture_items").update({ comparative_rank: i + 1 }).eq("id", list[i].id).eq("user_id", userId);
    }
  }
}

/** Editor + render: balanced shelf → engine-owned culture cards; demote fall-offs. */
async function renderCultureShelf(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rendered: number; demoted: number }> {
  const { data, error } = await supabase
    .from("culture_items")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "discovered")
    .not("final_score", "is", null)
    .limit(60);
  if (error || !data) return { rendered: 0, demoted: 0 };
  const items = (data as CultureItemRow[]).filter(
    (c) => Boolean(c.institution_name?.trim() || c.venue_name?.trim()),
  );

  const candidates: Array<CultureShelfCandidate & { item: CultureItemRow }> = items.map((c) => ({
    id: c.id,
    sub_library: c.sub_library,
    institution: c.institution_name ?? c.venue_name,
    final_score: c.final_score,
    depth_score: depthScore(c.depth_assessment),
    is_dated: c.is_dated,
    item: c,
  }));
  const { featured } = selectCultureShelf(candidates, { limit: FEATURED_TARGET, maxPerSubLibrary: 2, maxPerInstitution: 1, maxDated: 4 });
  const featuredIds = new Set(featured.map((f) => f.id));

  const { data: cardRows } = await supabase
    .from("surfaced_items")
    .select("id, source_id, status, payload")
    .eq("user_id", userId)
    .eq("category", "culture");
  const cardsByItem = new Map<string, ExistingCard[]>();
  for (const row of (cardRows ?? []) as ExistingCard[]) {
    if (!row.source_id) continue;
    const list = cardsByItem.get(row.source_id) ?? [];
    list.push(row);
    cardsByItem.set(row.source_id, list);
  }

  let rendered = 0;
  for (const f of featured) {
    const c = f.item;
    const cards = cardsByItem.get(c.id) ?? [];
    if (cards.some((x) => LOCKED_OR_ARCHIVED.has(x.status))) continue;
    const live = cards.find((x) => x.status === "shown" || x.status === "discovered");
    if (live) {
      const payload = isRecord(live.payload) ? live.payload : {};
      const { error: upErr } = await supabase
        .from("surfaced_items")
        .update({ status: "shown", destination: "radar", score: c.final_score ?? null, payload: { ...payload, ...culturePayload(c), source_layer: ENGINE_SOURCE } })
        .eq("id", live.id)
        .eq("user_id", userId);
      if (!upErr) rendered += 1;
      continue;
    }
    if (cards.length > 0) continue;
    const { error: insErr } = await supabase.from("surfaced_items").insert(buildCultureCard(userId, c));
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

function culturePayload(c: CultureItemRow): Record<string, unknown> {
  return {
    culture_id: c.id,
    sub_library: c.sub_library,
    institution_name: c.institution_name,
    is_dated: c.is_dated,
    pillar_tags: pillarsForItem({ category: "culture", lane: "culture", tags: c.vibe_keywords ?? [], title: c.title }),
    brief: { jarvis_line: c.verdict ?? c.description, hero_image_url: c.image_url },
    verified_source_url: c.source_url ?? c.discovered_via,
    ...(c.is_dated && c.starts_at ? { official_starts_at: c.starts_at, event_time_locked: true } : {}),
  };
}

function buildCultureCard(userId: string, c: CultureItemRow): Record<string, unknown> {
  return {
    user_id: userId,
    destination: "radar",
    source: "culture_engine",
    source_id: c.id,
    title: c.title,
    subtitle: c.institution_name ?? c.neighborhood ?? c.venue_name ?? null,
    description: c.verdict ?? c.description ?? null,
    location_name: c.institution_name ?? c.venue_name ?? null,
    address: c.venue_address ?? null,
    starts_at: c.is_dated ? c.starts_at : null,
    ends_at: c.is_dated ? c.ends_at : null,
    url: c.source_url ?? c.discovered_via ?? null,
    type: "culture",
    category: "culture",
    tags: c.vibe_keywords ?? [],
    reasons: [c.verdict ?? "", c.description ?? ""].filter(Boolean),
    score: c.final_score ?? c.verdict_strength ?? null,
    image_url: c.image_url ?? null,
    taste_fit_summary: c.verdict ?? null,
    status: "shown",
    payload: { source_layer: ENGINE_SOURCE, ...culturePayload(c) } as Json,
  };
}

/** Existing non-engine culture cards → engine-owned so cutover doesn't drop them. */
async function backfillEngineOwnership(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("surfaced_items")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("category", "culture")
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

/** Only DATED culture expires (timeless never does). */
async function expireDatedCulture(supabase: SupabaseClient, userId: string): Promise<{ items: number; cards: number }> {
  const nowIso = new Date().toISOString();
  const { data: itemData } = await supabase
    .from("culture_items")
    .update({ status: "expired", updated_at: nowIso })
    .eq("user_id", userId)
    .eq("is_dated", true)
    .lt("expires_at", nowIso)
    .in("status", ["discovered"])
    .select("id");
  const items = itemData?.length ?? 0;

  // Archive board cards for expired dated culture (match by source_id of expired items).
  let cards = 0;
  const { data: expiredIds } = await supabase
    .from("culture_items")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "expired")
    .eq("is_dated", true);
  const ids = ((expiredIds ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length) {
    const { data: c } = await supabase
      .from("surfaced_items")
      .update({ status: "archived" })
      .eq("user_id", userId)
      .eq("category", "culture")
      .in("source_id", ids)
      .in("status", ["shown", "discovered", "opened"])
      .select("id");
    cards = c?.length ?? 0;
  }
  return { items, cards };
}

async function countReady(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from("culture_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "discovered");
  return count ?? 0;
}

async function scoutCooledDown(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("culture_items")
    .select("first_seen_at")
    .eq("user_id", userId)
    .order("first_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = (data as { first_seen_at: string | null } | null)?.first_seen_at;
  if (!last) return true;
  const t = new Date(last).getTime();
  return !Number.isFinite(t) || Date.now() - t > SCOUT_MIN_INTERVAL_MS;
}

type ExistingCard = { id: string; source_id: string | null; status: string; payload: unknown };

function depthScore(a: unknown): number {
  return isRecord(a) && typeof a.depth_score === "number" ? a.depth_score : 0;
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
