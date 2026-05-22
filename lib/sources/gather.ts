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
  normalizeGooglePlace,
  normalizeTavilyResult,
  normalizeTicketmasterEvent,
  normalizeBraveResult,
} from "@/lib/sources/normalizers";
import { gatherLocalRadarCandidates } from "@/lib/sources/localRadar";
import type { CreateIndexedItemInput } from "@/lib/index/types";
import type { SourceHealth } from "@/lib/sources/types";
import { MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH } from "@/lib/brain/constants";

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

/**
 * Pull controlled batches from configured sources. Each lane is bounded;
 * we never run SerpAPI speculatively (shopping only on explicit request).
 * Brave is only used as a fallback when Tavily is not configured.
 *
 * Total candidates are capped at MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH (60)
 * across all lanes. If the cap is hit mid-run, remaining lanes are skipped.
 *
 * NOTE: Radar refresh is intentionally pull-based / manual. Do NOT call
 * gatherRadarCandidates() from a page render or server component. It belongs
 * exclusively in /api/radar/refresh (POST).
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

  // ── Google Places (structured place data) ──────────────────────────────────
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
          query: `${q.query} near ${ctx.city ?? "Chicago"}`,
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
        console.error("[gather] google-places", q.query, err);
      }
    }
    addLane("google-places", places);
  }

  // ── Ticketmaster (next 7 days, ~25 mile radius) ────────────────────────────
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
      console.error("[gather] ticketmaster", err);
    }
    addLane("ticketmaster", events);
  }

  // ── Tavily (cultural research, small batches) ──────────────────────────────
  // If Tavily is not configured, Brave serves as fallback for this lane only
  // (LocalRadar runs its own Tavily-first/Brave-fallback logic separately).
  if (!capReached()) {
    if (hasTavily()) {
      const queries: { query: string; category: string }[] = [
        {
          query: `cultural events ${ctx.city ?? "Chicago"} this week craftsmanship architecture`,
          category: "culture",
        },
        {
          query: `quiet refined dining new openings ${ctx.city ?? "Chicago"}`,
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
          console.error("[gather] tavily", q.query, err);
        }
      }
      addLane("tavily", research);
    } else if (hasBrave()) {
      // Brave fallback: only runs when Tavily is missing (never both)
      const queries = [
        { query: `cultural events ${ctx.city ?? "Chicago"} this week`, category: "culture" },
        { query: `new restaurant openings ${ctx.city ?? "Chicago"} 2025`, category: "dining" },
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
          console.error("[gather] brave-fallback", q.query, err);
        }
      }
      addLane("brave", braveResults);
    }
  }

  // ── Local Cultural Radar (web research, 6 focused groups) ─────────────────
  // Runs its own Tavily-first / Brave-fallback internally.
  if (!capReached()) {
    try {
      const localLanes = await gatherLocalRadarCandidates();
      for (const lane of localLanes) {
        if (capReached()) break;
        addLane(`local-radar:${lane.group}`, lane.candidates);
      }
    } catch (err) {
      console.error("[gather] local-radar", err);
    }
  }

  return results;
}

export function describeSourceHealth(): SourceHealth {
  return {
    "google-places": hasGooglePlaces() ? "available" : "not_configured",
    ticketmaster: hasTicketmaster() ? "available" : "not_configured",
    tavily: hasTavily() ? "available" : "not_configured",
    brave: hasBrave() ? "available" : "not_configured",
  };
}

function tmDate(date: Date): string {
  // Ticketmaster ISO format excludes ms.
  return date.toISOString().split(".")[0] + "Z";
}
