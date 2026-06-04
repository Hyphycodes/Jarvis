import { ApiError, fetchJson } from "@/lib/http";
import { cached, TTL } from "@/lib/cache";
import { hasEnv } from "@/lib/env";

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
  editorialSummary?: { text: string };
  currentOpeningHours?: { openNow?: boolean };
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
  "places.primaryType",
  "places.types",
  "places.regularOpeningHours.weekdayDescriptions",
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
