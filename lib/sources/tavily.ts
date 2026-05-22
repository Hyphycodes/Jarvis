import { ApiError, fetchJson } from "@/lib/http";
import { cached, TTL } from "@/lib/cache";
import { hasEnv } from "@/lib/env";

/**
 * Tavily Search — deeper research, cultural enrichment, booking detail.
 * https://docs.tavily.com/docs/python-sdk/tavily-search/api-reference
 */

const BASE = "https://api.tavily.com";

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string;
};

export type TavilySearchResponse = {
  query: string;
  answer?: string;
  results: TavilySearchResult[];
};

export type TavilyExtractResult = {
  url: string;
  rawContent?: string;
  content?: string;
};

function key(): string {
  const k = process.env.TAVILY_API_KEY;
  if (!k) throw new ApiError("TAVILY_API_KEY not set", "tavily", 0);
  return k;
}

export function hasTavily(): boolean {
  return hasEnv("TAVILY_API_KEY");
}

export async function searchWeb(input: {
  query: string;
  topic?: "general" | "news";
  maxResults?: number;
  days?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}): Promise<TavilySearchResponse> {
  const cacheKey = `tavily:search:${input.query}:${input.topic ?? "general"}:${input.maxResults ?? 5}:${(input.includeDomains ?? []).join(",")}:${(input.excludeDomains ?? []).join(",")}`;
  return cached(cacheKey, TTL.webSearch, async () =>
    fetchJson<TavilySearchResponse>(`${BASE}/search`, {
      service: "tavily",
      method: "POST",
      body: {
        api_key: key(),
        query: input.query,
        topic: input.topic ?? "general",
        max_results: Math.min(input.maxResults ?? 5, 10),
        days: input.days,
        include_domains: input.includeDomains,
        exclude_domains: input.excludeDomains,
        search_depth: "basic",
        include_answer: true,
      },
    }),
  );
}

export async function extractUrls(input: { urls: string[] }): Promise<{
  results: TavilyExtractResult[];
}> {
  const cacheKey = `tavily:extract:${input.urls.join("|")}`;
  return cached(cacheKey, TTL.webSearch, async () =>
    fetchJson<{ results: TavilyExtractResult[] }>(`${BASE}/extract`, {
      service: "tavily",
      method: "POST",
      body: { api_key: key(), urls: input.urls.slice(0, 5) },
    }),
  );
}
