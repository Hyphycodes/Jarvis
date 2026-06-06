import { ApiError, fetchJson } from "@/lib/http";
import { getAnthropicClient, hasAnthropic, DEFAULT_MODEL } from "@/lib/ai/anthropic";
import { cached, TTL } from "@/lib/cache";
import { hasEnv } from "@/lib/env";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";

/**
 * Google Places API (New). Field masks are mandatory for cost control.
 * https://developers.google.com/maps/documentation/places/web-service
 */

const BASE = "https://places.googleapis.com/v1";

export type GooglePlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  rating?: number;
  userRatingCount?: number;
  priceLevel?:
    | "PRICE_LEVEL_FREE"
    | "PRICE_LEVEL_INEXPENSIVE"
    | "PRICE_LEVEL_MODERATE"
    | "PRICE_LEVEL_EXPENSIVE"
    | "PRICE_LEVEL_VERY_EXPENSIVE";
  websiteUri?: string;
  googleMapsUri?: string;
  reservable?: boolean;
  editorialSummary?: { text: string };
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  photos?: { name: string }[];
  reviews?: {
    rating?: number;
    text?: { text?: string };
    publishTime?: string;
  }[];
};

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.editorialSummary",
  "places.currentOpeningHours.openNow",
  "places.photos.name",
].join(",");

const DETAILS_FIELDS_BASE = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "types",
  "primaryType",
  "primaryTypeDisplayName",
  "rating",
  "userRatingCount",
  "priceLevel",
  "websiteUri",
  "googleMapsUri",
  "editorialSummary",
  "currentOpeningHours.openNow",
  "photos.name",
];

const DETAILS_FIELDS_WITH_REVIEWS = [
  ...DETAILS_FIELDS_BASE,
  "reviews.rating",
  "reviews.text",
  "reviews.publishTime",
];

function key(): string {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) {
    throw new ApiError(
      "GOOGLE_PLACES_API_KEY is not set",
      "google-places",
      0,
    );
  }
  return k;
}

export function hasGooglePlaces(): boolean {
  return hasEnv("GOOGLE_PLACES_API_KEY");
}

export async function searchPlaces(input: {
  query: string;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  includedTypes?: string[];
  maxResults?: number;
}): Promise<GooglePlace[]> {
  const cacheKey = `gplaces:search:${input.query}:${input.lat ?? "_"},${input.lng ?? "_"}:${input.radiusMeters ?? "_"}:${(input.includedTypes ?? []).join(",")}`;
  return cached(cacheKey, TTL.placesSearch, async () => {
    const body: Record<string, unknown> = {
      textQuery: input.query,
      maxResultCount: Math.min(input.maxResults ?? 12, 20),
    };
    if (input.lat != null && input.lng != null) {
      body.locationBias = {
        circle: {
          center: { latitude: input.lat, longitude: input.lng },
          radius: input.radiusMeters ?? 16_000,
        },
      };
    }
    if (input.includedTypes?.length) {
      body.includedType = input.includedTypes[0];
    }
    const data = await fetchJson<{ places?: GooglePlace[] }>(
      `${BASE}/places:searchText`,
      {
        service: "google-places",
        method: "POST",
        headers: {
          "X-Goog-Api-Key": key(),
          "X-Goog-FieldMask": SEARCH_FIELDS,
        },
        body,
      },
    );
    return data.places ?? [];
  });
}

export async function nearbyPlaces(input: {
  lat: number;
  lng: number;
  radiusMeters: number;
  includedTypes?: string[];
  maxResults?: number;
}): Promise<GooglePlace[]> {
  const cacheKey = `gplaces:nearby:${input.lat.toFixed(3)},${input.lng.toFixed(3)}:${input.radiusMeters}:${(input.includedTypes ?? []).join(",")}`;
  return cached(cacheKey, TTL.placesSearch, async () => {
    const body: Record<string, unknown> = {
      locationRestriction: {
        circle: {
          center: { latitude: input.lat, longitude: input.lng },
          radius: Math.min(input.radiusMeters, 50_000),
        },
      },
      maxResultCount: Math.min(input.maxResults ?? 12, 20),
    };
    if (input.includedTypes?.length) body.includedTypes = input.includedTypes;
    const data = await fetchJson<{ places?: GooglePlace[] }>(
      `${BASE}/places:searchNearby`,
      {
        service: "google-places",
        method: "POST",
        headers: {
          "X-Goog-Api-Key": key(),
          "X-Goog-FieldMask": SEARCH_FIELDS,
        },
        body,
      },
    );
    return data.places ?? [];
  });
}

export async function getPlaceDetails(input: {
  placeId: string;
  includeReviews?: boolean;
}): Promise<GooglePlace> {
  const fields = input.includeReviews
    ? DETAILS_FIELDS_WITH_REVIEWS
    : DETAILS_FIELDS_BASE;
  const cacheKey = `gplaces:details:${input.placeId}:${input.includeReviews ? "r" : "b"}`;
  return cached(cacheKey, TTL.placeDetails, async () =>
    fetchJson<GooglePlace>(`${BASE}/places/${input.placeId}`, {
      service: "google-places",
      headers: {
        "X-Goog-Api-Key": key(),
        "X-Goog-FieldMask": fields.join(","),
      },
    }),
  );
}

const ENRICHMENT_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.priceLevel",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.primaryType",
  "places.types",
  "places.currentOpeningHours.weekdayDescriptions",
  "places.photos.name",
].join(",");

/**
 * Single best text-search match with the fields needed to enrich a Library
 * place (address, lat/lng, price, weekday hours). Returns null when there is
 * no result — the caller decides whether the match is confident enough.
 */
export async function searchPlaceForEnrichment(input: {
  query: string;
  lat?: number;
  lng?: number;
}): Promise<GooglePlace | null> {
  const body: Record<string, unknown> = {
    textQuery: input.query,
    maxResultCount: 1,
  };
  if (input.lat != null && input.lng != null) {
    body.locationBias = {
      circle: {
        center: { latitude: input.lat, longitude: input.lng },
        radius: 16_000,
      },
    };
  }
  const data = await fetchJson<{ places?: GooglePlace[] }>(
    `${BASE}/places:searchText`,
    {
      service: "google-places",
      method: "POST",
      headers: {
        "X-Goog-Api-Key": key(),
        "X-Goog-FieldMask": ENRICHMENT_FIELDS,
      },
      body,
    },
  );
  return data.places?.[0] ?? null;
}

export function getPlacePhotoUrl(input: {
  photoName: string;
  maxWidthPx?: number;
}): string {
  // Photo redirect — clients fetch the bytes directly. Returned as a hint
  // URL; the server doesn't proxy the actual image.
  const max = input.maxWidthPx ?? 720;
  return `${BASE}/${input.photoName}/media?maxWidthPx=${max}&key=${encodeURIComponent(
    process.env.GOOGLE_PLACES_API_KEY ?? "",
  )}`;
}

/**
 * Resolve a Google Places photo resource name to its actual CDN URI.
 * Uses skipHttpRedirect=true so we get the real URL without following a redirect.
 * Returns null if the fetch fails or returns no URI.
 */
export async function resolvePhotoUri(input: {
  photoName: string;
  maxWidthPx?: number;
}): Promise<string | null> {
  const max = input.maxWidthPx ?? 1080;
  const url =
    `${BASE}/${input.photoName}/media` +
    `?maxWidthPx=${max}&skipHttpRedirect=true&key=${encodeURIComponent(key())}`;
  try {
    const data = await fetchJson<{ photoUri?: string }>(url, {
      service: "google-places",
      method: "GET",
    });
    return data.photoUri ?? null;
  } catch {
    return null;
  }
}

/**
 * Given a list of Google Places photo resource names, pick the one that works
 * best as a cinematic full-bleed hero image for this venue type.
 * Returns null if no photos can be resolved.
 */
export async function pickBestVenuePhoto(input: {
  photoNames: string[];
  venueName: string;
  category: string;
}): Promise<string | null> {
  if (!input.photoNames.length) return null;

  const candidates = input.photoNames.slice(0, 5);
  const uris = await Promise.all(
    candidates.map((name) =>
      resolvePhotoUri({ photoName: name, maxWidthPx: 1080 }),
    ),
  );
  const valid = uris.filter((uri): uri is string => uri !== null);
  if (!valid.length) return null;
  if (valid.length === 1 || !hasAnthropic()) return valid[0];

  try {
    const client = getAnthropicClient();
    const imageBlocks = valid.map((url) => ({
      type: "image" as const,
      source: { type: "url" as const, url },
    }));

    console.info("[pickBestVenuePhoto] vision selection", {
      venueName: input.venueName,
      category: input.category,
      candidates: valid.length,
    });

    const request = {
      model: DEFAULT_MODEL,
      max_tokens: 64,
      stream: false,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `These are photos of ${input.venueName} (${input.category}). ` +
                "Pick the best one as a cinematic full-bleed hero image — " +
                "prefer interior atmosphere, architectural character, or strong mood. " +
                "Avoid: food close-ups as the sole subject, parking lots, generic exteriors, blurry shots. " +
                'Reply with only a JSON object: { "best_index": <0-based index> }',
            },
            ...imageBlocks,
          ],
        },
      ],
    } as unknown as MessageCreateParamsNonStreaming;

    const response = await client.messages.create(request);

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim()) as {
      best_index?: number;
    };
    const idx = typeof parsed.best_index === "number" ? parsed.best_index : 0;
    const clamped = Math.max(0, Math.min(idx, valid.length - 1));
    console.info("[pickBestVenuePhoto] selected", {
      venueName: input.venueName,
      bestIndex: clamped,
    });
    return valid[clamped] ?? valid[0];
  } catch (error) {
    console.warn("[pickBestVenuePhoto] vision fallback", {
      venueName: input.venueName,
      error: error instanceof Error ? error.message : String(error),
    });
    return valid[0];
  }
}
