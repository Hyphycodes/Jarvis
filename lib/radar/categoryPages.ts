import "server-only";

import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { listIndexItems } from "@/lib/index/repo";
import { isRadarCategory, type RadarCategory } from "@/lib/radar/category";
import {
  RADAR_CATEGORY_COPY,
  RADAR_FILTER_KEYS,
  type GlanceTileKey,
  type RadarFilterKey,
} from "@/lib/radar/categoryCopy";
import type {
  CategoryPageData,
  ConfirmedEntry,
  ListEntry,
  RadarCategoryPagesPayload,
} from "@/lib/radar/categoryPagesTypes";
import type { IndexedItem } from "@/lib/index/types";

/**
 * Data for the composed Radar category pages. One pass over surfaced_items
 * (single query via listIndexItems) plus one plans query — everything else is
 * in-memory aggregation, mirroring how selectBalancedRadarInventory works.
 *
 * Honesty contract (per the Radar pages spec): every count is derived from
 * real rows; zero-count tiles are dropped here so the client can never render
 * a fake number.
 */

const DAY_MS = 86_400_000;

type PlanRow = { id: string; key_stats: unknown; status: string | null };

export type RadarPageInputs = {
  items: IndexedItem[];
  plansById: Map<string, PlanRow>;
};

const EMPTY_PAGE: CategoryPageData = {
  heldCount: 0,
  glance: [],
  confirmed: [],
  saved: [],
  savedTotal: 0,
};

export function emptyRadarCategoryPagesPayload(): RadarCategoryPagesPayload {
  const pages = {} as Record<RadarFilterKey, CategoryPageData>;
  for (const key of RADAR_FILTER_KEYS) pages[key] = EMPTY_PAGE;
  return { pages, favoriteIds: [] };
}

/** Fetch the raw inputs once — shared by the layout loader and the tile API. */
export async function collectRadarPageInputs(): Promise<RadarPageInputs> {
  const [items, plansById] = await Promise.all([
    listIndexItems({
      destination: ["radar", "today", "upcoming", "holding"],
      // "discovered" is included only so Holding (which resets items to
      // discovered) is countable; aggregation ignores it elsewhere.
      status: ["discovered", "shown", "opened", "saved", "planned", "completed"],
      limit: 600,
    }),
    fetchPlans(),
  ]);
  return { items, plansById };
}

async function fetchPlans(): Promise<Map<string, PlanRow>> {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return new Map();
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("plans")
      .select("id,key_stats,status")
      .eq("user_id", id)
      .order("updated_at", { ascending: false })
      .limit(300);
    if (error) {
      console.error("[radar.categoryPages] plans query failed", error.message);
      return new Map();
    }
    return new Map(((data ?? []) as PlanRow[]).map((plan) => [plan.id, plan]));
  } catch (error) {
    console.error("[radar.categoryPages] plans query failed", error);
    return new Map();
  }
}

export async function loadRadarCategoryPages(): Promise<RadarCategoryPagesPayload> {
  try {
    const inputs = await collectRadarPageInputs();
    return buildRadarCategoryPages(inputs);
  } catch (error) {
    console.error("[radar.categoryPages] loader failed", error);
    return emptyRadarCategoryPagesPayload();
  }
}

export function buildRadarCategoryPages(
  inputs: RadarPageInputs,
): RadarCategoryPagesPayload {
  const pages = {} as Record<RadarFilterKey, CategoryPageData>;
  for (const filter of RADAR_FILTER_KEYS) {
    const pool = poolForFilter(inputs.items, filter);
    // Always emit all four tiles for the filter (the at-a-glance grid is a
    // fixed 4-box row, like the reference). Counts are real — a 0 is a true 0,
    // not a fabricated number.
    const glance = RADAR_CATEGORY_COPY[filter].tiles.map((tile) => ({
      key: tile.key,
      count: selectTileItems(inputs, filter, tile.key).length,
    }));
    const confirmed = pool
      .filter((item) => item.status === "planned")
      .map((item) => toConfirmedEntry(item, inputs.plansById))
      .filter((entry): entry is ConfirmedEntry => Boolean(entry))
      // Dated commitments first (soonest up top), undated plans after.
      .sort((a, b) => confirmedSortTime(a) - confirmedSortTime(b));
    const savedItems = pool
      .filter((item) => item.status === "saved")
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    pages[filter] = {
      heldCount: pool.filter(isSurfacedActive).length,
      glance,
      confirmed,
      saved: savedItems.slice(0, 5).map((item) => toListEntry(item, inputs.plansById)),
      savedTotal: savedItems.length,
    };
  }
  const favoriteIds = inputs.items
    .filter((item) => isFavorited(item))
    .map((item) => item.id);
  return { pages, favoriteIds };
}

/**
 * Items behind a single stat tile — the same predicate set produces the tile
 * counts above and the tile sheet lists in /api/radar/tile-items, so the two
 * can never disagree.
 */
export function selectTileItems(
  inputs: RadarPageInputs,
  filter: RadarFilterKey,
  tile: GlanceTileKey,
): IndexedItem[] {
  const now = Date.now();
  const pool = poolForFilter(inputs.items, filter);
  switch (tile) {
    case "held":
      // The Holding collection (deferred via "Wait"), not surfaced actives.
      return inputs.items.filter((item) => item.destination === "holding");
    case "saved":
      return pool.filter((item) => item.status === "saved");
    case "thisWeek":
      return pool.filter(
        (item) =>
          isActiveStatus(item) && startsWithin(item.startsAt, now, 7 * DAY_MS),
      );
    case "newToday":
      return pool.filter(
        (item) => isSurfacedActive(item) && isSameDay(item.createdAt, now),
      );
    case "new":
      return pool.filter(
        (item) =>
          isSurfacedActive(item) && withinPast(item.createdAt, now, 7 * DAY_MS),
      );
    case "available":
    case "toTry":
      return pool.filter(isSurfacedActive);
    case "upcoming":
      return pool.filter(
        (item) => isActiveStatus(item) && isFuture(item.startsAt, now),
      );
    case "confirmed":
    case "reservations":
      // Real commitments: planned status (linked to a plan). Dated ones must
      // still be upcoming; undated plans count — they're committed, not stale.
      return pool.filter((item) => {
        if (item.status !== "planned") return false;
        const start = resolveCommittedStart(item, inputs.plansById);
        return !start || isFuture(start, now);
      });
    case "favorites":
      return pool.filter(isFavorited);
    case "thisMonth":
      return pool.filter(
        (item) =>
          isActiveStatus(item) && startsWithin(item.startsAt, now, 30 * DAY_MS),
      );
    case "nearby":
      // No server-side user location exists; "nearby" means the item carries
      // real coordinates. Never fake distance.
      return pool.filter(
        (item) =>
          isActiveStatus(item) &&
          typeof item.lat === "number" &&
          typeof item.lng === "number",
      );
    case "attainable":
      return pool.filter(
        (item) => isSurfacedActive(item) && readBudgetTier(item) === "attainable",
      );
    case "aspirational":
      return pool.filter(
        (item) => isSurfacedActive(item) && readBudgetTier(item) === "aspirational",
      );
    case "buyNow": {
      return pool.filter((item) => {
        if (!isSurfacedActive(item)) return false;
        const tierValue = readBudgetTier(item);
        return (
          (tierValue === "attainable" || tierValue === "premium-realistic") &&
          Boolean(readProductUrl(item))
        );
      });
    }
  }
}

export function toListEntry(
  item: IndexedItem,
  plansById: Map<string, PlanRow>,
): ListEntry {
  return {
    id: item.id,
    title: item.title,
    subtitle: listSubtitle(item),
    imageUrl: item.imageUrl,
    href: hrefForItem(item, plansById),
    category: canonicalCategory(item),
    favorited: isFavorited(item),
  };
}

function toConfirmedEntry(
  item: IndexedItem,
  plansById: Map<string, PlanRow>,
): ConfirmedEntry | null {
  const whenIso = resolveCommittedStart(item, plansById);
  // A dated commitment that already started is stale — drop it. An undated
  // planned item is still a live commitment and renders as PLANNED.
  if (whenIso && !isFuture(whenIso, Date.now())) return null;
  return {
    id: item.id,
    title: item.title,
    detailLine: listSubtitle(item),
    whenIso,
    imageUrl: item.imageUrl,
    href: hrefForItem(item, plansById),
    category: canonicalCategory(item),
    favorited: isFavorited(item),
  };
}

function confirmedSortTime(entry: ConfirmedEntry): number {
  if (!entry.whenIso) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(entry.whenIso);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

// ── Predicates & field readers ───────────────────────────────────────────────

function poolForFilter(items: IndexedItem[], filter: RadarFilterKey): IndexedItem[] {
  if (filter === "all") return items;
  return items.filter((item) => canonicalCategory(item) === filter);
}

function canonicalCategory(item: IndexedItem): RadarCategory | undefined {
  return isRadarCategory(item.category) ? item.category : undefined;
}

/** Live on the Radar board right now. */
function isSurfacedActive(item: IndexedItem): boolean {
  return item.status === "shown" || item.status === "opened";
}

/** Any status that represents a live (non-holding-reset) item. */
function isActiveStatus(item: IndexedItem): boolean {
  return (
    item.status === "shown" ||
    item.status === "opened" ||
    item.status === "saved" ||
    item.status === "planned"
  );
}

function isFavorited(item: IndexedItem): boolean {
  const payload = asRecord(item.rawPayload);
  return typeof payload?.favorited_at === "string" && payload.favorited_at.length > 0;
}

function readBudgetTier(item: IndexedItem): string | undefined {
  const finds = asRecord(asRecord(item.rawPayload)?.finds);
  return typeof finds?.budget_tier === "string" ? finds.budget_tier : undefined;
}

function readProductUrl(item: IndexedItem): string | undefined {
  const finds = asRecord(asRecord(item.rawPayload)?.finds);
  const bestPick = asRecord(finds?.best_pick);
  return typeof bestPick?.product_url === "string" ? bestPick.product_url : undefined;
}

/**
 * The committed start for a planned item: the row's own starts_at, else the
 * linked plan's key_stats.starts_at (a confirmed time, not a suggestion).
 */
function resolveCommittedStart(
  item: IndexedItem,
  plansById: Map<string, PlanRow>,
): string | undefined {
  if (item.startsAt) return item.startsAt;
  const planId = readPlanId(item.rawPayload);
  const plan = planId ? plansById.get(planId) : undefined;
  const keyStats = asRecord(plan?.key_stats);
  return typeof keyStats?.starts_at === "string" ? keyStats.starts_at : undefined;
}

function hrefForItem(item: IndexedItem, plansById: Map<string, PlanRow>): string {
  if (canonicalCategory(item) === "finds") return `/find/${item.id}`;
  const slug = readPlanSlug(item.rawPayload) ?? planSlugFromId(item, plansById);
  if (slug) return `/plan/${slug}`;
  return `/item/${item.id}`;
}

function planSlugFromId(
  item: IndexedItem,
  plansById: Map<string, PlanRow>,
): string | undefined {
  const planId = readPlanId(item.rawPayload);
  const plan = planId ? plansById.get(planId) : undefined;
  const keyStats = asRecord(plan?.key_stats);
  return typeof keyStats?.slug === "string" ? keyStats.slug : undefined;
}

function listSubtitle(item: IndexedItem): string | undefined {
  const parts: string[] = [];
  const area = item.locationName ?? item.address;
  if (area && normalize(area) !== normalize(item.title)) parts.push(area);
  if (parts.length === 0 && item.subtitle && normalize(item.subtitle) !== normalize(item.title)) {
    parts.push(item.subtitle);
  }
  return parts[0];
}

// Duplicated from lib/dispatch/loadSurface.ts (private helpers there; the
// 1700-line file is deliberately untouched).
function readPlanSlug(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof record?.plan_slug === "string" ? record.plan_slug : undefined;
}

function readPlanId(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof record?.plan_id === "string" ? record.plan_id : undefined;
}

function startsWithin(iso: string | undefined, now: number, windowMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= now && t <= now + windowMs;
}

function withinPast(iso: string | undefined, now: number, windowMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= now && t >= now - windowMs;
}

function isFuture(iso: string | undefined, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > now;
}

function isSameDay(iso: string | undefined, now: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const ref = new Date(now);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
