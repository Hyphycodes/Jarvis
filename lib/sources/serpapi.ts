import { ApiError, fetchJson } from "@/lib/http";
import { cached, TTL } from "@/lib/cache";
import { hasEnv } from "@/lib/env";

/**
 * SerpAPI Google Shopping. Only call when the item type/category is product
 * or shopping — never speculatively.
 */

const BASE = "https://serpapi.com/search.json";

export type SerpShoppingResult = {
  position?: number;
  title: string;
  link?: string;
  product_link?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  rating?: number;
  reviews?: number;
  thumbnail?: string;
  delivery?: string;
  product_id?: string;
};

export type SerpGoogleEventResult = {
  title?: string;
  date?: {
    start_date?: string;
    when?: string;
  };
  address?: string[];
  link?: string;
  event_location_map?: {
    link?: string;
  };
  venue?: {
    name?: string;
    rating?: number;
    reviews?: number;
    link?: string;
  };
  ticket_info?: Array<{
    source?: string;
    link?: string;
    link_type?: string;
  }>;
  description?: string;
  thumbnail?: string;
};

function key(): string {
  const k = process.env.SERPAPI_KEY;
  if (!k) throw new ApiError("SERPAPI_KEY not set", "serpapi", 0);
  return k;
}

export function hasSerpapi(): boolean {
  return hasEnv("SERPAPI_KEY");
}

export async function searchProducts(input: {
  query: string;
  location?: string;
  priceMin?: number;
  priceMax?: number;
  maxResults?: number;
}): Promise<SerpShoppingResult[]> {
  const cacheKey = `serpapi:shopping:${input.query}:${input.location ?? ""}:${input.priceMin ?? ""}:${input.priceMax ?? ""}`;
  return cached(cacheKey, TTL.shopping, async () => {
    const data = await fetchJson<{ shopping_results?: SerpShoppingResult[] }>(
      BASE,
      {
        service: "serpapi",
        query: {
          engine: "google_shopping",
          q: input.query,
          location: input.location,
          api_key: key(),
          num: Math.min(input.maxResults ?? 12, 24),
          ...(input.priceMin != null || input.priceMax != null
            ? {
                tbs: `mr:1,price:1${input.priceMin != null ? `,ppr_min:${input.priceMin}` : ""}${
                  input.priceMax != null ? `,ppr_max:${input.priceMax}` : ""
                }`,
              }
            : {}),
        },
      },
    );
    return data.shopping_results ?? [];
  });
}

export type SerpEventsDiagnostics = {
  engine: string;
  query: string;
  location?: string;
  hl: string;
  gl: string;
  htichips?: string;
  /** search_metadata.status (e.g. "Success") or null when the request threw. */
  status: string | null;
  /** SerpAPI top-level `error` string, or the thrown HTTP error message. */
  error: string | null;
  topLevelKeys: string[];
  hasEventsResults: boolean;
  eventsCount: number;
  /** Other event-like top-level keys, if events_results is absent. */
  altEventKeys: string[];
};

export type SerpEventsInput = {
  query: string;
  location?: string;
  hl?: string;
  gl?: string;
  /** Google Events date chip, e.g. "date:week" | "date:month" | "date:today". */
  htichips?: string;
  /** "google_events" (default) or "google" (regular search onebox fallback). */
  engine?: "google_events" | "google";
  maxResults?: number;
};

/**
 * SerpAPI Google Events with full response-shape diagnostics. Never throws and
 * never silently swallows: a transport error or SerpAPI `error` is captured in
 * `diagnostics` (status/error/topLevelKeys/eventsCount) so the scout can log WHY
 * a query returned nothing instead of treating an error like "no events".
 */
export async function searchGoogleEventsWithDiagnostics(
  input: SerpEventsInput,
): Promise<{ events: SerpGoogleEventResult[]; diagnostics: SerpEventsDiagnostics }> {
  const engine = input.engine ?? "google_events";
  const hl = input.hl ?? "en";
  const gl = input.gl ?? "us";
  const cacheKey = `serpapi:${engine}:${input.query}:${input.location ?? ""}:${input.htichips ?? ""}:${gl}:${hl}:${input.maxResults ?? 10}`;
  return cached(cacheKey, TTL.events, async () => {
    const query: Record<string, string | undefined> = {
      engine,
      q: input.query,
      location: input.location,
      hl,
      gl,
      api_key: key(),
    };
    if (input.htichips) query.htichips = input.htichips;

    let data: Record<string, unknown> = {};
    let error: string | null = null;
    try {
      data = await fetchJson<Record<string, unknown>>(BASE, { service: "serpapi", query });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const meta = isRecord(data.search_metadata) ? data.search_metadata : {};
    const status = typeof meta.status === "string" ? meta.status : error ? "error" : null;
    if (typeof data.error === "string") error = data.error;
    const eventsRaw = Array.isArray(data.events_results)
      ? (data.events_results as SerpGoogleEventResult[])
      : [];
    const topLevelKeys = Object.keys(data);
    const events = eventsRaw.slice(0, Math.min(input.maxResults ?? 10, 20));
    return {
      events,
      diagnostics: {
        engine,
        query: input.query,
        location: input.location,
        hl,
        gl,
        htichips: input.htichips,
        status,
        error,
        topLevelKeys,
        hasEventsResults: Array.isArray(data.events_results),
        eventsCount: eventsRaw.length,
        altEventKeys: topLevelKeys.filter((k) => /event/i.test(k) && k !== "events_results"),
      },
    };
  });
}

export async function searchGoogleEvents(input: SerpEventsInput): Promise<SerpGoogleEventResult[]> {
  const { events } = await searchGoogleEventsWithDiagnostics(input);
  return events;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
