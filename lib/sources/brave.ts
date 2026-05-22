import { ApiError, fetchJson } from "@/lib/http";
import { cached, TTL } from "@/lib/cache";
import { hasEnv } from "@/lib/env";

/**
 * Brave Search — backup web search. Use sparingly.
 * https://api.search.brave.com/app/documentation
 */

const BASE = "https://api.search.brave.com/res/v1";

export type BraveResult = {
  title: string;
  url: string;
  description?: string;
  age?: string;
};

function key(): string {
  const k = process.env.BRAVE_API_KEY;
  if (!k) throw new ApiError("BRAVE_API_KEY not set", "brave", 0);
  return k;
}

export function hasBrave(): boolean {
  return hasEnv("BRAVE_API_KEY");
}

export async function webSearch(input: {
  query: string;
  count?: number;
  freshness?: "pd" | "pw" | "pm" | "py";
}): Promise<BraveResult[]> {
  const cacheKey = `brave:web:${input.query}:${input.count ?? 5}:${input.freshness ?? ""}`;
  return cached(cacheKey, TTL.webSearch, async () => {
    const data = await fetchJson<{
      web?: { results?: BraveResult[] };
    }>(`${BASE}/web/search`, {
      service: "brave",
      headers: {
        "X-Subscription-Token": key(),
      },
      query: {
        q: input.query,
        count: Math.min(input.count ?? 5, 10),
        freshness: input.freshness,
      },
    });
    return data.web?.results ?? [];
  });
}
