/**
 * Local Cultural Radar — web-research source lane.
 *
 * Six focused query groups covering the founder's core interests.
 * Tavily is preferred; Brave is the fallback if Tavily is not configured.
 * Results are normalized into CreateIndexedItemInput candidates with
 * local-radar provenance tags so the curator can distinguish them from
 * structured API data.
 *
 * Lead extraction: article snippets are scanned for named places/businesses.
 * The extracted lead is stored in rawPayload.lead_name so downstream enrichment
 * (e.g. Google Places lookup) can verify it if appropriate.
 */

import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import { hasBrave, webSearch } from "@/lib/sources/brave";
import type { TavilySearchResult } from "@/lib/sources/tavily";
import type { BraveResult } from "@/lib/sources/brave";
import type { CreateIndexedItemInput, IndexItemType } from "@/lib/index/types";
import { LOCAL_RADAR_MAX_RESULTS_PER_QUERY } from "@/lib/brain/constants";

// ── Dynamic lane support (Sprint 2.2) ────────────────────────────────────────

/**
 * A single lane-driven search request from the Curiosity Engine.
 * Independent of the 6 static query groups — the strategist decides what to ask.
 */
export type LocalRadarLaneQuery = {
  laneId: string;
  query: string;
  type: IndexItemType;
  category: string;
  tags: string[];
  preferredDomains?: string[];
  excludedDomains?: string[];
  maxResults?: number;
};

export type LocalRadarLaneResult = {
  laneId: string;
  query: string;
  candidates: CreateIndexedItemInput[];
  source: "tavily" | "brave" | "none";
};

/**
 * Lane-driven LocalRadar gather. Used by the Curiosity Engine in Radar
 * refresh. Honors the same per-query result cap as static groups and
 * Tavily-first / Brave-fallback selection. Never throws; per-query failures
 * are logged and the rest continue.
 */
export async function gatherLocalRadarLanes(
  laneQueries: LocalRadarLaneQuery[],
): Promise<LocalRadarLaneResult[]> {
  if (laneQueries.length === 0) return [];
  const canTavily = hasTavily();
  const canBrave = hasBrave();
  if (!canTavily && !canBrave) return [];

  const out: LocalRadarLaneResult[] = [];
  for (const lq of laneQueries) {
    const max = Math.min(
      lq.maxResults ?? LOCAL_RADAR_MAX_RESULTS_PER_QUERY,
      LOCAL_RADAR_MAX_RESULTS_PER_QUERY,
    );
    try {
      let candidates: CreateIndexedItemInput[] = [];
      let used: "tavily" | "brave" | "none" = "none";

      if (canTavily) {
        const data = await searchWeb({
          query: lq.query,
          maxResults: max,
          includeDomains:
            lq.preferredDomains && lq.preferredDomains.length > 0
              ? lq.preferredDomains
              : undefined,
          excludeDomains:
            lq.excludedDomains && lq.excludedDomains.length > 0
              ? lq.excludedDomains
              : undefined,
          days: 30,
        });
        candidates = data.results
          .map((r) => normalizeLaneTavily(r, lq))
          .filter((c): c is CreateIndexedItemInput => c !== null);
        used = "tavily";
      } else if (canBrave) {
        const data = await webSearch({
          query: lq.query,
          count: max,
          freshness: "pm",
        });
        candidates = data
          .map((r) => normalizeLaneBrave(r, lq))
          .filter((c): c is CreateIndexedItemInput => c !== null);
        used = "brave";
      }

      out.push({
        laneId: lq.laneId,
        query: lq.query,
        candidates,
        source: used,
      });
    } catch (err) {
      console.error("[local-radar.lane]", lq.laneId, lq.query, err);
      out.push({
        laneId: lq.laneId,
        query: lq.query,
        candidates: [],
        source: "none",
      });
    }
  }
  return out;
}

function normalizeLaneTavily(
  result: TavilySearchResult,
  lq: LocalRadarLaneQuery,
): CreateIndexedItemInput | null {
  const title = cleanTitle(result.title);
  if (!title) return null;
  if (shouldRejectSearchResult({
    title,
    snippet: result.content,
    url: result.url,
    query: lq.query,
    publishedDate: result.published_date,
  })) {
    return null;
  }
  const leadName = extractLeadName(title, result.content);
  return {
    type: lq.type,
    destination: "radar" as const,
    source: "research" as const,
    sourceId: `lane:${lq.laneId}:${result.url}`,
    title: leadName ?? title,
    subtitle: leadName ? title : undefined,
    description: result.content?.slice(0, 400) ?? undefined,
    url: result.url,
    reasons: [
      `Strategist lane: ${lq.laneId}`,
      `Query: "${lq.query}"`,
      ...(leadName ? [`Lead extracted: ${leadName}`] : []),
    ],
    tags: [
      ...lq.tags,
      "strategist-lane",
      ...(leadName ? ["article-lead"] : ["web-result"]),
    ],
    rawPayload: {
      lane_id: lq.laneId,
      query: lq.query,
      source_url: result.url,
      source_title: result.title,
      lead_name: leadName ?? null,
      tavily_score: result.score ?? null,
      published_date: result.published_date ?? null,
    },
  };
}

function normalizeLaneBrave(
  result: BraveResult,
  lq: LocalRadarLaneQuery,
): CreateIndexedItemInput | null {
  const title = cleanTitle(result.title);
  if (!title) return null;
  if (shouldRejectSearchResult({
    title,
    snippet: result.description,
    url: result.url,
    query: lq.query,
    age: result.age,
  })) {
    return null;
  }
  const leadName = extractLeadName(title, result.description);
  return {
    type: lq.type,
    destination: "radar" as const,
    source: "research" as const,
    sourceId: `lane:${lq.laneId}:${result.url}`,
    title: leadName ?? title,
    subtitle: leadName ? title : undefined,
    description: result.description?.slice(0, 400) ?? undefined,
    url: result.url,
    reasons: [
      `Strategist lane: ${lq.laneId}`,
      `Query: "${lq.query}"`,
      ...(leadName ? [`Lead extracted: ${leadName}`] : []),
    ],
    tags: [
      ...lq.tags,
      "strategist-lane",
      "brave-source",
      ...(leadName ? ["article-lead"] : ["web-result"]),
    ],
    rawPayload: {
      lane_id: lq.laneId,
      query: lq.query,
      source_url: result.url,
      source_title: result.title,
      lead_name: leadName ?? null,
      age: result.age ?? null,
    },
  };
}

// ── Query group definitions ──────────────────────────────────────────────────

export type LocalRadarGroup =
  | "chicago_food"
  | "chicago_culture"
  | "chicago_music"
  | "chicago_style"
  | "chicago_products"
  | "italy_travel_lifestyle";

type QueryGroupConfig = {
  group: LocalRadarGroup;
  query: string;
  type: IndexItemType;
  category: string;
  tags: string[];
  preferredDomains?: string[];
};

const QUERY_GROUPS: QueryGroupConfig[] = [
  {
    group: "chicago_food",
    query:
      "best new restaurant openings Chicago 2025 atmospheric fine dining intimate",
    type: "restaurant",
    category: "dining",
    tags: ["chicago", "dining", "local-radar", "chicago_food"],
    preferredDomains: [
      "eater.com",
      "chicagomag.com",
      "chicago.eater.com",
      "tinyurl.com",
      "infatuation.com",
      "seriouseats.com",
    ],
  },
  {
    group: "chicago_culture",
    query:
      "Chicago art exhibit gallery opening cultural event this month craftsmanship",
    type: "culture",
    category: "culture",
    tags: ["chicago", "culture", "local-radar", "chicago_culture"],
    preferredDomains: [
      "timeout.com",
      "chicagomag.com",
      "artic.edu",
      "chicagoreader.com",
      "designchicago.org",
    ],
  },
  {
    group: "chicago_music",
    query:
      "Chicago jazz live music intimate venue performance this week upcoming",
    type: "event",
    category: "music",
    tags: ["chicago", "music", "jazz", "live", "local-radar", "chicago_music"],
    preferredDomains: [
      "timeout.com",
      "jazzchicago.net",
      "chicagoreader.com",
      "domu.com",
    ],
  },
  {
    group: "chicago_style",
    query:
      "Chicago menswear boutique artisan leather goods craft quality independent store",
    type: "place",
    category: "style",
    tags: [
      "chicago",
      "style",
      "menswear",
      "craft",
      "local-radar",
      "chicago_style",
    ],
    preferredDomains: [
      "timeout.com",
      "chicagomag.com",
      "gq.com",
      "esquire.com",
    ],
  },
  {
    group: "chicago_products",
    query:
      "handcrafted artisan quality goods leather accessories made Chicago independent brand",
    type: "product",
    category: "style",
    tags: [
      "chicago",
      "craft",
      "artisan",
      "product",
      "local-radar",
      "chicago_products",
    ],
    preferredDomains: [
      "timeout.com",
      "chicagomag.com",
      "uncrate.com",
      "huckberry.com",
    ],
  },
  {
    group: "italy_travel_lifestyle",
    query:
      "Italian craftsmanship lifestyle culture travel slow living artisan 2025",
    type: "culture",
    category: "culture",
    tags: ["italy", "craft", "lifestyle", "culture", "local-radar", "italy_travel_lifestyle"],
    preferredDomains: [
      "cntraveler.com",
      "vogue.com",
      "theguardian.com",
      "wallpaper.com",
      "monocle.com",
      "slowtravelstories.com",
    ],
  },
];

// ── Main export ──────────────────────────────────────────────────────────────

export type LocalRadarResult = {
  group: LocalRadarGroup;
  candidates: CreateIndexedItemInput[];
  source: "tavily" | "brave" | "none";
};

/**
 * Run all six query groups. Tavily is preferred; Brave is the fallback.
 * Returns one result set per group that returned at least one candidate.
 * Never throws — individual group failures are caught and logged.
 */
export async function gatherLocalRadarCandidates(): Promise<LocalRadarResult[]> {
  const results: LocalRadarResult[] = [];
  const canTavily = hasTavily();
  const canBrave = hasBrave();

  if (!canTavily && !canBrave) return results;

  for (const config of QUERY_GROUPS) {
    try {
      let candidates: CreateIndexedItemInput[] = [];
      let usedSource: "tavily" | "brave" | "none" = "none";

      if (canTavily) {
        const data = await searchWeb({
          query: config.query,
          maxResults: LOCAL_RADAR_MAX_RESULTS_PER_QUERY,
          includeDomains:
            config.preferredDomains && config.preferredDomains.length > 0
              ? config.preferredDomains
              : undefined,
          days: 30,
        });
        candidates = data.results
          .map((r) => normalizeTavilyLead(r, config))
          .filter((c): c is CreateIndexedItemInput => c !== null);
        usedSource = "tavily";
      } else if (canBrave) {
        const data = await webSearch({
          query: config.query,
          count: LOCAL_RADAR_MAX_RESULTS_PER_QUERY,
          freshness: "pm",
        });
        candidates = data
          .map((r) => normalizeBraveLead(r, config))
          .filter((c): c is CreateIndexedItemInput => c !== null);
        usedSource = "brave";
      }

      if (candidates.length > 0) {
        results.push({
          group: config.group,
          candidates,
          source: usedSource,
        });
      }
    } catch (err) {
      console.error("[local-radar] group", config.group, err);
    }
  }

  return results;
}

// ── Normalizers ───────────────────────────────────────────────────────────────

function normalizeTavilyLead(
  result: TavilySearchResult,
  config: QueryGroupConfig,
): CreateIndexedItemInput | null {
  const title = cleanTitle(result.title);
  if (!title) return null;
  if (shouldRejectSearchResult({
    title,
    snippet: result.content,
    url: result.url,
    query: config.query,
    publishedDate: result.published_date,
  })) {
    return null;
  }

  const leadName = extractLeadName(title, result.content);
  const snippet = result.content?.slice(0, 400) ?? "";

  return {
    type: config.type,
    destination: "radar" as const,
    source: "research" as const,
    sourceId: `local-radar:${config.group}:${result.url}`,
    title: leadName ?? title,
    subtitle: leadName ? cleanTitle(result.title) : undefined,
    description: snippet || undefined,
    url: result.url,
    reasons: [
      `Discovered via LocalRadar: ${humanGroupLabel(config.group)}`,
      ...(leadName ? [`Mentioned in: ${title}`] : []),
    ],
    tags: [
      ...config.tags,
      ...(leadName ? ["article-lead"] : ["web-result"]),
    ],
    rawPayload: {
      query_group: config.group,
      query: config.query,
      source_url: result.url,
      source_title: result.title,
      lead_name: leadName ?? null,
      tavily_score: result.score ?? null,
      published_date: result.published_date ?? null,
    },
  };
}

function normalizeBraveLead(
  result: BraveResult,
  config: QueryGroupConfig,
): CreateIndexedItemInput | null {
  const title = cleanTitle(result.title);
  if (!title) return null;
  if (shouldRejectSearchResult({
    title,
    snippet: result.description,
    url: result.url,
    query: config.query,
    age: result.age,
  })) {
    return null;
  }

  const leadName = extractLeadName(title, result.description);

  return {
    type: config.type,
    destination: "radar" as const,
    source: "research" as const,
    sourceId: `local-radar:${config.group}:${result.url}`,
    title: leadName ?? title,
    subtitle: leadName ? cleanTitle(result.title) : undefined,
    description: result.description?.slice(0, 400) ?? undefined,
    url: result.url,
    reasons: [
      `Discovered via LocalRadar (Brave): ${humanGroupLabel(config.group)}`,
      ...(leadName ? [`Mentioned in: ${title}`] : []),
    ],
    tags: [
      ...config.tags,
      "brave-source",
      ...(leadName ? ["article-lead"] : ["web-result"]),
    ],
    rawPayload: {
      query_group: config.group,
      query: config.query,
      source_url: result.url,
      source_title: result.title,
      lead_name: leadName ?? null,
      age: result.age ?? null,
    },
  };
}

// ── Lead extraction ────────────────────────────────────────────────────────────

/**
 * Heuristic extraction of a specific business/venue name from article text.
 *
 * Handles common article title patterns:
 *   "Review: Smyth Is the Best Restaurant in Chicago Right Now"  → "Smyth"
 *   "Dinner at The Publican" → "The Publican"
 *   "Inside Alinea's New Menu" → "Alinea"
 *   "Best New Restaurants 2025: ..." → null (listicle header — no single lead)
 *
 * Returns null if no confident single lead is found. Callers should fall back
 * to using the full article title as the item title.
 */
function extractLeadName(title: string, content?: string): string | null {
  const t = title.trim();

  // "Review: Name" or "Review — Name"
  const reviewMatch = t.match(/^review[:\s–—]+(.+?)(?:\s+(?:is|at|in|for|a|an)\s|$)/i);
  if (reviewMatch) {
    const name = reviewMatch[1].trim().replace(/['"]/g, "");
    if (name.length > 0 && name.length < 60 && !name.match(/^\d/)) return name;
  }

  // "Dinner/Lunch/Breakfast at Name" — captures short proper-noun phrases
  const atMatch = t.match(/(?:dinner|lunch|brunch|breakfast|drinks|visit|inside)\s+at\s+([A-Z][^,.:]+)/i);
  if (atMatch) {
    const name = atMatch[1].trim();
    if (name.length > 1 && name.length < 50) return name;
  }

  // "Inside Name's " or "Inside Name —"
  const insideMatch = t.match(/^inside\s+([A-Z][^'s\s][^,.:–—]+)/i);
  if (insideMatch) {
    const name = insideMatch[1].trim();
    if (name.length > 1 && name.length < 50) return name;
  }

  // "Name Is Chicago's Best..." — lead word(s) before " Is" verb
  const isVerbMatch = t.match(/^([A-Z][a-zA-Z\s&'-]{2,40}?)\s+(?:is|has|wins|named|opens|gets)\b/);
  if (isVerbMatch && !isVerbMatch[1].match(/\b(best|top|new|great|good|why|how|what|this|these|the)\b/i)) {
    const name = isVerbMatch[1].trim();
    if (name.split(" ").length <= 4) return name;
  }

  // Scan content snippet for the pattern "at [ProperNounPhrase]"
  if (content) {
    const contentAt = content.match(/\bat\s+([A-Z][a-zA-Z\s&'-]{2,35}?)(?:[,.]|\s+(?:in|on|at|for|a|an|is|are)\b)/);
    if (contentAt) {
      const name = contentAt[1].trim();
      if (name.length > 2 && name.length < 40 && name.split(" ").length <= 5) {
        return name;
      }
    }
  }

  return null;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*[\|•·—]\s*.+$/, "") // strip " | Site Name" suffixes
    .replace(/^\s+|\s+$/, "")
    .trim();
}

function shouldRejectSearchResult(input: {
  title: string;
  snippet?: string;
  url?: string;
  query?: string;
  publishedDate?: string | null;
  age?: string | null;
}): boolean {
  const title = input.title.trim();
  const snippet = input.snippet ?? "";
  const domain = safeDomain(input.url)?.toLowerCase() ?? "";
  const haystack = `${title} ${snippet} ${input.url ?? ""}`.toLowerCase();

  if (/(instagram|tiktok|facebook|x\.com|twitter)\.com/.test(domain)) {
    return !/(event|opening|tickets|venue|restaurant|store|market|gallery)/i.test(haystack);
  }
  if (/#\w+/.test(title) || /comments?\s+and\s+posts|profile\s+photos/i.test(title)) {
    return true;
  }
  if (/near me|coupon|groupon|tripadvisor|yelp|directory|yellow pages|mapquest/i.test(haystack)) {
    return true;
  }
  if (/^(best|top)\s+\d+\b/i.test(title) && !extractLeadName(title, snippet)) {
    return true;
  }
  if (/ultimate guide|things to do|everything you need to know/i.test(haystack)) {
    return true;
  }
  if (input.query && literalOverlap(title, input.query) > 0.72) {
    return true;
  }
  if (input.publishedDate && isOlderThanDays(input.publishedDate, 90)) {
    return true;
  }
  if (input.age && /\b(20[0-2][0-4]|[2-9]\s+years?\s+ago)\b/i.test(input.age)) {
    return true;
  }
  return false;
}

function literalOverlap(title: string, query: string): number {
  const titleWords = new Set(words(title).filter((word) => word.length > 4));
  const queryWords = words(query).filter((word) => word.length > 4);
  if (queryWords.length === 0) return 0;
  return queryWords.filter((word) => titleWords.has(word)).length / queryWords.length;
}

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function isOlderThanDays(iso: string, days: number): boolean {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time > days * 24 * 60 * 60 * 1000;
}

function safeDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function humanGroupLabel(group: LocalRadarGroup): string {
  const map: Record<LocalRadarGroup, string> = {
    chicago_food: "Chicago food",
    chicago_culture: "Chicago culture",
    chicago_music: "Chicago music",
    chicago_style: "Chicago style",
    chicago_products: "Chicago products",
    italy_travel_lifestyle: "Italy / lifestyle",
  };
  return map[group] ?? group;
}
