import "server-only";

import {
  hasGooglePlaces,
  searchPlaces,
} from "@/lib/sources/googlePlaces";
import {
  hasTicketmaster,
  searchEvents,
} from "@/lib/sources/ticketmaster";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import { hasBrave, webSearch } from "@/lib/sources/brave";
import {
  searchProducts as searchSerpProducts,
  hasSerpapi,
} from "@/lib/sources/serpapi";
import {
  normalizeGooglePlace,
  normalizeTavilyResult,
  normalizeTicketmasterEvent,
  normalizeBraveResult,
  normalizeShoppingResult,
} from "@/lib/sources/normalizers";
import {
  gatherLocalRadarCandidates,
  gatherLocalRadarLanes,
  type LocalRadarLaneQuery,
} from "@/lib/sources/localRadar";
import type { CreateIndexedItemInput, IndexItemType } from "@/lib/index/types";
import type { SourceHealth } from "@/lib/sources/types";
import { MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH } from "@/lib/brain/constants";
import type {
  CuriosityPlan,
  SourceName,
  SourcePlanEntry,
} from "@/lib/brain/curiosity";

export type RadarLaneResult = {
  source: string;
  candidates: CreateIndexedItemInput[];
};

export type GatherContext = {
  userId: string;
  homeLat: number;
  homeLng: number;
  city?: string;
  state?: string;
};

// ── Lane-driven gather (Sprint 2.2 — primary path) ──────────────────────────

/**
 * Execute the source plan produced by the Curiosity Engine.
 *
 * This is the PRIMARY refresh path when the Taste Strategist is active.
 * Falls back to `gatherRadarCandidates()` when the strategist returned no
 * usable lanes (e.g. no Anthropic key + empty graph).
 *
 * NOTE: Radar refresh is intentionally pull-based / manual. Do NOT call
 * any function in this module from a page render or server component.
 */
export async function gatherFromCuriosityPlan(
  ctx: GatherContext,
  plan: CuriosityPlan,
): Promise<RadarLaneResult[]> {
  const results: RadarLaneResult[] = [];
  let total = 0;

  // Group plan entries by source so each adapter is hit in batches.
  const bySource = groupBySource(plan.sourcePlan);

  function addLane(source: string, candidates: CreateIndexedItemInput[]) {
    if (candidates.length === 0) return;
    const remaining = MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH - total;
    if (remaining <= 0) return;
    const trimmed = candidates.slice(0, remaining);
    total += trimmed.length;
    results.push({ source, candidates: trimmed });
  }

  // ── localRadar (Tavily/Brave through LocalRadar's normalizer) ───────────
  const localEntries = bySource.localRadar ?? [];
  if (localEntries.length > 0 && (hasTavily() || hasBrave())) {
    const laneQueries: LocalRadarLaneQuery[] = [];
    for (const entry of localEntries) {
      const lane = plan.lanes.find((l) => l.id === entry.lane_id);
      const type = inferType(lane?.interest_area);
      const category = inferCategory(lane?.interest_area);
      const tags = buildLaneTags(lane, entry);
      for (const q of entry.queries) {
        laneQueries.push({
          laneId: entry.lane_id,
          query: q,
          type,
          category,
          tags,
          preferredDomains: entry.preferred_domains,
          excludedDomains: entry.excluded_domains,
          maxResults: entry.max_results,
        });
      }
    }
    try {
      const laneResults = await gatherLocalRadarLanes(laneQueries);
      for (const lr of laneResults) {
        addLane(`local-radar:${lr.laneId}`, lr.candidates);
      }
    } catch (err) {
      console.error("[gather.plan] localRadar", err);
    }
  }

  // ── googlePlaces ────────────────────────────────────────────────────────
  for (const entry of bySource.googlePlaces ?? []) {
    if (!hasGooglePlaces()) break;
    if (total >= MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH) break;
    const lane = plan.lanes.find((l) => l.id === entry.lane_id);
    const category = inferCategory(lane?.interest_area);
    const places: CreateIndexedItemInput[] = [];
    for (const query of entry.queries) {
      try {
        const found = await searchPlaces({
          query: withCity(query, ctx.city),
          lat: ctx.homeLat,
          lng: ctx.homeLng,
          radiusMeters: 24_000,
          maxResults: entry.max_results,
        });
        for (const p of found) {
          const norm = normalizeGooglePlace(p, { category });
          if (norm) places.push(norm);
        }
      } catch (err) {
        console.error("[gather.plan] googlePlaces", query, err);
      }
    }
    addLane(`google-places:${entry.lane_id}`, places);
  }

  // ── ticketmaster ────────────────────────────────────────────────────────
  for (const entry of bySource.ticketmaster ?? []) {
    if (!hasTicketmaster()) break;
    if (total >= MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH) break;
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const events: CreateIndexedItemInput[] = [];
    try {
      const found = await searchEvents({
        lat: ctx.homeLat,
        lng: ctx.homeLng,
        radiusMiles: 25,
        startDateTime: tmDate(now),
        endDateTime: tmDate(week),
        size: entry.max_results,
        keyword: entry.queries[0],
      });
      for (const e of found) {
        const norm = normalizeTicketmasterEvent(e);
        if (norm) events.push(norm);
      }
    } catch (err) {
      console.error("[gather.plan] ticketmaster", err);
    }
    addLane(`ticketmaster:${entry.lane_id}`, events);
  }

  // ── tavily / brave (direct, not via localRadar) ────────────────────────
  // Only used when the strategist explicitly chose "tavily" or "brave" as
  // the source (most lanes go through localRadar instead).
  for (const entry of bySource.tavily ?? []) {
    if (!hasTavily()) break;
    if (total >= MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH) break;
    const lane = plan.lanes.find((l) => l.id === entry.lane_id);
    const category = inferCategory(lane?.interest_area);
    const items: CreateIndexedItemInput[] = [];
    for (const q of entry.queries) {
      try {
        const data = await searchWeb({ query: q, maxResults: entry.max_results, days: 30 });
        for (const r of data.results) {
          const norm = normalizeTavilyResult(r, { category });
          if (norm) items.push(norm);
        }
      } catch (err) {
        console.error("[gather.plan] tavily", q, err);
      }
    }
    addLane(`tavily:${entry.lane_id}`, items);
  }
  for (const entry of bySource.brave ?? []) {
    if (!hasBrave() || hasTavily()) break; // never use Brave if Tavily exists
    if (total >= MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH) break;
    const lane = plan.lanes.find((l) => l.id === entry.lane_id);
    const category = inferCategory(lane?.interest_area);
    const items: CreateIndexedItemInput[] = [];
    for (const q of entry.queries) {
      try {
        const data = await webSearch({ query: q, count: entry.max_results, freshness: "pm" });
        for (const r of data) {
          const norm = normalizeBraveResult(r, { category });
          if (norm) items.push(norm);
        }
      } catch (err) {
        console.error("[gather.plan] brave", q, err);
      }
    }
    addLane(`brave:${entry.lane_id}`, items);
  }

  // ── serpapi (gated: explicit product lanes only) ───────────────────────
  for (const entry of bySource.serpapi ?? []) {
    if (!hasSerpapi()) break;
    if (total >= MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH) break;
    const items: CreateIndexedItemInput[] = [];
    for (const q of entry.queries) {
      try {
        const data = await searchSerpProducts({ query: q, maxResults: entry.max_results });
        for (const r of data) {
          const norm = normalizeShoppingResult(r);
          if (norm) items.push(norm);
        }
      } catch (err) {
        console.error("[gather.plan] serpapi", q, err);
      }
    }
    addLane(`serpapi:${entry.lane_id}`, items);
  }

  return results;
}

// ── Static / fallback gather (kept for no-Anthropic mode) ───────────────────

/**
 * Static-default gather. Used as the fallback when the Taste Strategist
 * produces no lanes (e.g. no Anthropic key AND empty Interest Graph).
 *
 * Identical behavior to Sprint 2.1 — bounded queries from each available
 * source.
 */
export async function gatherRadarCandidates(
  ctx: GatherContext,
): Promise<RadarLaneResult[]> {
  const results: RadarLaneResult[] = [];
  let totalCandidates = 0;

  function capReached() {
    return totalCandidates >= MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH;
  }

  function addLane(source: string, candidates: CreateIndexedItemInput[]) {
    if (candidates.length === 0) return;
    const remaining = MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH - totalCandidates;
    const trimmed = candidates.slice(0, remaining);
    totalCandidates += trimmed.length;
    results.push({ source, candidates: trimmed });
  }

  if (!capReached() && hasGooglePlaces()) {
    const queries: { query: string; category: string }[] = [
      { query: "atmospheric dining", category: "dining" },
      { query: "quiet cigar lounge", category: "places" },
      { query: "jazz bar", category: "music" },
      { query: "specialty cafe", category: "dining" },
      { query: "boutique hotel bar", category: "places" },
    ];
    const places: CreateIndexedItemInput[] = [];
    for (const q of queries) {
      if (capReached()) break;
      try {
        const found = await searchPlaces({
          query: withCity(q.query, ctx.city),
          lat: ctx.homeLat,
          lng: ctx.homeLng,
          radiusMeters: 24_000,
          maxResults: 5,
        });
        for (const place of found) {
          const norm = normalizeGooglePlace(place, { category: q.category });
          if (norm) places.push(norm);
        }
      } catch (err) {
        console.error("[gather.static] google-places", q.query, err);
      }
    }
    addLane("google-places", places);
  }

  if (!capReached() && hasTicketmaster()) {
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const events: CreateIndexedItemInput[] = [];
    try {
      const found = await searchEvents({
        lat: ctx.homeLat,
        lng: ctx.homeLng,
        radiusMiles: 25,
        startDateTime: tmDate(now),
        endDateTime: tmDate(week),
        size: 20,
      });
      for (const event of found) {
        const norm = normalizeTicketmasterEvent(event);
        if (norm) events.push(norm);
      }
    } catch (err) {
      console.error("[gather.static] ticketmaster", err);
    }
    addLane("ticketmaster", events);
  }

  if (!capReached()) {
    if (hasTavily()) {
      const queries: { query: string; category: string }[] = [
        {
          query: withCity("cultural events this week craftsmanship architecture", ctx.city),
          category: "culture",
        },
        {
          query: withCity("quiet refined dining new openings", ctx.city),
          category: "dining",
        },
      ];
      const research: CreateIndexedItemInput[] = [];
      for (const q of queries) {
        if (capReached()) break;
        try {
          const data = await searchWeb({
            query: q.query,
            maxResults: 4,
            days: 14,
          });
          for (const result of data.results) {
            const norm = normalizeTavilyResult(result, { category: q.category });
            if (norm) research.push(norm);
          }
        } catch (err) {
          console.error("[gather.static] tavily", q.query, err);
        }
      }
      addLane("tavily", research);
    } else if (hasBrave()) {
      const queries = [
        { query: withCity("cultural events this week", ctx.city), category: "culture" },
        { query: withCity(`new restaurant openings ${new Date().getFullYear()}`, ctx.city), category: "dining" },
      ];
      const braveResults: CreateIndexedItemInput[] = [];
      for (const q of queries) {
        if (capReached()) break;
        try {
          const data = await webSearch({ query: q.query, count: 4, freshness: "pm" });
          for (const result of data) {
            const norm = normalizeBraveResult(result, { category: q.category });
            if (norm) braveResults.push(norm);
          }
        } catch (err) {
          console.error("[gather.static] brave-fallback", q.query, err);
        }
      }
      addLane("brave", braveResults);
    }
  }

  if (!capReached()) {
    try {
      const localLanes = await gatherLocalRadarCandidates({ city: ctx.city });
      for (const lane of localLanes) {
        if (capReached()) break;
        addLane(`local-radar:${lane.group}`, lane.candidates);
      }
    } catch (err) {
      console.error("[gather.static] local-radar", err);
    }
  }

  return results;
}

function withCity(query: string, city?: string): string {
  return city ? `${query} near ${city}` : query;
}

// ── Source availability snapshot ────────────────────────────────────────────

export function describeAvailableSources(): Partial<Record<SourceName, boolean>> {
  return {
    localRadar: hasTavily() || hasBrave(),
    googlePlaces: hasGooglePlaces(),
    ticketmaster: hasTicketmaster(),
    tavily: hasTavily(),
    brave: hasBrave(),
    serpapi: hasSerpapi(),
  };
}

export function describeSourceHealth(): SourceHealth {
  return {
    "google-places": hasGooglePlaces() ? "available" : "not_configured",
    ticketmaster: hasTicketmaster() ? "available" : "not_configured",
    tavily: hasTavily() ? "available" : "not_configured",
    brave: hasBrave() ? "available" : "not_configured",
    serpapi: hasSerpapi() ? "available" : "not_configured",
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function groupBySource(
  entries: SourcePlanEntry[],
): Partial<Record<SourceName, SourcePlanEntry[]>> {
  const out: Partial<Record<SourceName, SourcePlanEntry[]>> = {};
  for (const e of entries) {
    if (e.source === "none") continue;
    (out[e.source] ??= []).push(e);
  }
  return out;
}

function buildLaneTags(
  lane: { interest_area?: string; subinterests?: string[]; mode?: string } | undefined,
  entry: SourcePlanEntry,
): string[] {
  const tags = ["local-radar", "strategist-lane", entry.lane_id];
  if (lane?.interest_area) tags.push(lane.interest_area);
  if (lane?.mode) tags.push(`mode:${lane.mode}`);
  for (const s of lane?.subinterests ?? []) tags.push(s);
  return tags.slice(0, 12);
}

function inferType(interestArea?: string): IndexItemType {
  if (!interestArea) return "recommendation";
  if (interestArea.startsWith("dining")) return "restaurant";
  if (interestArea === "culture_nightlife") return "event";
  if (interestArea === "style_menswear" || interestArea === "watches") return "product";
  if (interestArea === "real_estate_wealth") return "real_estate";
  if (interestArea === "land_homestead") return "real_estate";
  if (interestArea === "creative_craft") return "creative";
  if (interestArea === "travel_italy") return "travel";
  if (interestArea === "health_discipline") return "health";
  if (interestArea === "faith_meaning") return "recommendation";
  if (interestArea === "tech_ai_tools") return "recommendation";
  if (interestArea === "outdoors_nature") return "place";
  return "recommendation";
}

function inferCategory(interestArea?: string): string {
  if (!interestArea) return "culture";
  const map: Record<string, string> = {
    dining: "dining",
    culture_nightlife: "culture",
    style_menswear: "style",
    watches: "style",
    real_estate_wealth: "opportunity",
    land_homestead: "opportunity",
    creative_craft: "culture",
    travel_italy: "travel",
    health_discipline: "places",
    faith_meaning: "culture",
    tech_ai_tools: "opportunity",
    outdoors_nature: "places",
  };
  return map[interestArea] ?? "culture";
}

function tmDate(date: Date): string {
  return date.toISOString().split(".")[0] + "Z";
}
