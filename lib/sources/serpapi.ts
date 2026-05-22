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
