import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { hasGooglePlaces, searchPlaces } from "@/lib/sources/googlePlaces";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import { HIGH_TRUST_DOMAINS } from "@/lib/intelligence/sourceTrust";
import { getDefaultLocation } from "@/lib/env";
import type { RadarCategory } from "@/lib/radar/category";

export type ResearcherOutput = {
  canonical_name: string;
  slug: string;
  place_type:
    | "restaurant"
    | "bar"
    | "lounge"
    | "venue"
    | "shop"
    | "hotel"
    | "cultural"
    | "ritual"
    | "outdoor";
  neighborhood: string | null;
  cuisine_or_focus: string;
  price_level: "$" | "$$" | "$$$" | "$$$$" | "unknown";
  hours_summary: string;
  vibe_keywords: string[];
  sources_cited: Array<{ url: string; publication: string; snippet: string }>;
  events_observed: Array<{ type: string; day?: string; notes: string }>;
  seasonal_notes: string | null;
  confidence: number;
  uncertainties: string[];
};

const SYSTEM_PROMPT = `You are Jarvis's RESEARCHER. You build a structured dossier for a single place by synthesizing canonical data and editorial sources.

You are not a critic. You are not a marketer. You are a thorough analyst. Your job is accuracy and depth.

RULES
- Use ONLY information present in the provided sources. Never invent addresses, hours, chef names, or events.
- If a fact is unclear or contradicted across sources, note it in \`uncertainties\` rather than guessing.
- \`vibe_keywords\` should be evocative and specific — "low-lit hotel-restaurant intimate" not "nice cozy fancy."
- \`events_observed\` only contains events explicitly mentioned in sources. If the article says "Wednesday jazz nights," include it. If no events are mentioned, return an empty array.
- \`confidence\` reflects how strong your sources are: 3+ trusted publications = high (0.8+), 1 trusted + thin coverage = medium (0.5-0.7), unclear/sparse = low (under 0.5).
- \`seasonal_notes\` only if explicitly grounded in sources — "patio opens in summer" if a source mentioned it, otherwise null.

Return strict JSON matching the ResearcherOutput schema.`;

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function priceLevelFromGoogle(
  level: string | undefined,
): ResearcherOutput["price_level"] {
  switch (level) {
    case "PRICE_LEVEL_INEXPENSIVE": return "$";
    case "PRICE_LEVEL_MODERATE": return "$$";
    case "PRICE_LEVEL_EXPENSIVE": return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE": return "$$$$";
    default: return "unknown";
  }
}

// Category-aware research hints. The researcher stays one function, but the
// editorial query and the default place_type adapt so a culture/moves/places
// candidate isn't searched as if it were a restaurant.
const CATEGORY_HINTS: Record<
  RadarCategory,
  { reviewSuffix: string; placeType: ResearcherOutput["place_type"]; trustedDomains?: string[] }
> = {
  dining: {
    reviewSuffix: "restaurant review menu chef hours reservation",
    placeType: "restaurant",
    trustedDomains: ["chicago.eater.com", "eater.com", "timeout.com", "infatuation.com", "resy.com", "exploretock.com"],
  },
  places: {
    reviewSuffix: "bar lounge cigar lounge bookstore park guide hours",
    placeType: "venue",
    trustedDomains: ["timeout.com", "thrillist.com", "atlasobscura.com"],
  },
  moves: {
    reviewSuffix: "class booking schedule price hours sign up",
    placeType: "outdoor",
  },
  culture: {
    reviewSuffix: "exhibit gallery museum show dates hours tickets",
    placeType: "cultural",
    trustedDomains: ["artic.edu", "mcachicago.org", "timeout.com", "chicagoreader.com", "choosechicago.com"],
  },
  events: {
    reviewSuffix: "event date time venue tickets lineup",
    placeType: "venue",
    trustedDomains: ["ticketmaster.com", "eventbrite.com", "songkick.com", "dice.fm", "choosechicago.com"],
  },
  finds: {
    reviewSuffix: "product review where to buy price",
    placeType: "shop",
  },
};

function deterministicFallback(name: string, reason: string, category?: RadarCategory): ResearcherOutput {
  return {
    canonical_name: name,
    slug: makeSlug(name),
    place_type: category ? CATEGORY_HINTS[category].placeType : "restaurant",
    neighborhood: null,
    cuisine_or_focus: "unknown",
    price_level: "unknown",
    hours_summary: "unknown",
    vibe_keywords: [],
    sources_cited: [],
    events_observed: [],
    seasonal_notes: null,
    confidence: 0.3,
    uncertainties: [reason],
  };
}

export async function researchPlace(
  name: string,
  context?: { discoveredUrl?: string; snippet?: string; category?: RadarCategory },
): Promise<ResearcherOutput> {
  const hint = context?.category ? CATEGORY_HINTS[context.category] : null;
  const home = (() => {
    try { return getDefaultLocation(); }
    catch { return null; }
  })();

  // 1. Google Places: canonical location data
  let googleData: Record<string, unknown> | null = null;
  if (hasGooglePlaces() && home) {
    try {
      const results = await searchPlaces({
        query: home.city ? `${name} ${home.city}` : name,
        lat: home.lat,
        lng: home.lng,
        maxResults: 3,
      });
      const top = results[0];
      if (top) {
        googleData = {
          name: top.displayName?.text ?? name,
          address: top.formattedAddress,
          lat: top.location?.latitude,
          lng: top.location?.longitude,
          price_level: priceLevelFromGoogle(top.priceLevel),
          open_now: top.currentOpeningHours?.openNow,
          types: top.types?.slice(0, 5),
          editorial_summary: top.editorialSummary?.text,
          rating: top.rating,
          rating_count: top.userRatingCount,
        };
      }
    } catch (err) {
      console.warn("[researcher] Google Places failed", { name, err });
    }
  }

  // 2. Tavily: editorial coverage (two parallel searches)
  const editorialSources: Array<{ url: string; title: string; content: string }> = [];
  if (hasTavily()) {
    try {
      const city = home?.city;
      const queryName = city ? `"${name}" ${city}` : `"${name}"`;
      // Source routing: augment the trusted-domain set with category-specific
      // sources (food press for dining, museum/venue/ticketing for culture/events)
      // so research pulls from the right places per lane. Merge, never replace,
      // to keep recall.
      const trustedDomains = hint?.trustedDomains
        ? Array.from(new Set([...HIGH_TRUST_DOMAINS, ...hint.trustedDomains]))
        : HIGH_TRUST_DOMAINS;
      const [trusted, broad] = await Promise.allSettled([
        searchWeb({
          query: queryName,
          maxResults: 5,
          includeDomains: trustedDomains,
        }),
        searchWeb({
          query: `${queryName} ${hint?.reviewSuffix ?? "restaurant review"}`,
          maxResults: 3,
        }),
      ]);

      const seen = new Set<string>();
      for (const res of [trusted, broad]) {
        if (res.status !== "fulfilled") continue;
        for (const r of res.value.results) {
          if (!seen.has(r.url)) {
            seen.add(r.url);
            editorialSources.push({ url: r.url, title: r.title, content: r.content });
          }
        }
      }
    } catch (err) {
      console.warn("[researcher] Tavily search failed", { name, err });
    }
  }

  if (!hasAnthropic()) {
    return deterministicFallback(name, "No Anthropic key — dossier not synthesized", context?.category);
  }

  const prompt = JSON.stringify(
    {
      place_name: name,
      google_data: googleData,
      editorial_sources: editorialSources.slice(0, 8).map((s) => ({
        url: s.url,
        title: s.title,
        snippet: s.content.slice(0, 400),
      })),
      context_snippet: context?.snippet ?? null,
      context_url: context?.discoveredUrl ?? null,
      instructions: [
        "Build a structured dossier using ONLY the provided sources.",
        "Return strict JSON matching ResearcherOutput.",
      ],
    },
    null,
    2,
  );

  try {
    const raw = await generateStructured<ResearcherOutput>({
      system: SYSTEM_PROMPT,
      prompt,
      schemaName: "ResearcherOutput",
      temperature: 0.2,
      maxTokens: 4000,
    });
    // Ensure slug + place_type are set (fall back to the category default).
    const slug = raw.slug?.trim() || makeSlug(raw.canonical_name ?? name);
    const place_type = raw.place_type ?? hint?.placeType ?? "restaurant";
    return { ...raw, slug, place_type, canonical_name: raw.canonical_name ?? name };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[researcher] structured generation failed", { name, reason });
    return deterministicFallback(name, `Claude error: ${reason}`, context?.category);
  }
}
