import type {
  CreateIndexedItemInput,
  IndexItemType,
} from "@/lib/index/types";
import type { GooglePlace } from "@/lib/sources/googlePlaces";
import { getPlacePhotoUrl } from "@/lib/sources/googlePlaces";
import type { TicketmasterEvent } from "@/lib/sources/ticketmaster";
import type { TavilySearchResult } from "@/lib/sources/tavily";
import type { BraveResult } from "@/lib/sources/brave";
import type { SerpShoppingResult } from "@/lib/sources/serpapi";
import type { MlbGame } from "@/lib/sources/mlb";

/**
 * Every source result lands here. Adapters never write raw shapes into
 * the index — they go through these normalizers first.
 */

const PLACE_TYPE_BY_GOOGLE_TYPE: Record<string, IndexItemType> = {
  restaurant: "restaurant",
  bar: "place",
  cafe: "place",
  meal_takeaway: "restaurant",
  meal_delivery: "restaurant",
  night_club: "place",
  movie_theater: "culture",
  art_gallery: "culture",
  museum: "culture",
  stadium: "event",
  lodging: "travel",
  spa: "health",
  gym: "health",
  store: "product",
  shopping_mall: "product",
};

const PLACE_CATEGORY_BY_GOOGLE_TYPE: Record<string, string> = {
  restaurant: "dining",
  bar: "places",
  cafe: "dining",
  night_club: "places",
  movie_theater: "culture",
  art_gallery: "culture",
  museum: "culture",
  stadium: "events",
  lodging: "travel",
  spa: "places",
  gym: "places",
  store: "shopping",
  shopping_mall: "shopping",
};

export function normalizeGooglePlace(
  place: GooglePlace,
  hints: { category?: string; type?: IndexItemType } = {},
): CreateIndexedItemInput | null {
  if (!place.id || !place.displayName?.text) return null;

  const primary = place.primaryType ?? place.types?.[0] ?? "place";
  const type = hints.type ?? PLACE_TYPE_BY_GOOGLE_TYPE[primary] ?? "place";
  const category =
    hints.category ?? PLACE_CATEGORY_BY_GOOGLE_TYPE[primary] ?? "places";

  const photoName = place.photos?.[0]?.name;
  const imageUrl = photoName ? getPlacePhotoUrl({ photoName }) : undefined;

  const tags = uniq(
    [
      ...(place.types ?? []),
      primary,
      category,
      place.priceLevel ? priceTag(place.priceLevel) : null,
      place.currentOpeningHours?.openNow ? "open_now" : null,
    ].filter(isString),
  );

  const reasons: string[] = [];
  if (place.rating != null && place.userRatingCount != null) {
    reasons.push(`Rated ${place.rating.toFixed(1)} (${place.userRatingCount} reviews)`);
  }
  if (place.editorialSummary?.text) reasons.push(place.editorialSummary.text);

  return {
    type,
    destination: "radar",
    title: place.displayName.text,
    source: "places",
    sourceId: place.id,
    category,
    subtitle: place.primaryTypeDisplayName?.text ?? place.shortFormattedAddress,
    description: place.editorialSummary?.text,
    locationName: place.shortFormattedAddress ?? place.formattedAddress,
    address: place.formattedAddress,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    url: place.websiteUri ?? place.googleMapsUri,
    imageUrl,
    rawPayload: place as unknown as CreateIndexedItemInput["rawPayload"],
    status: "discovered",
    score: place.rating != null ? clamp01(place.rating / 5) : undefined,
    reasons,
    tags,
  };
}

export function normalizeTicketmasterEvent(
  event: TicketmasterEvent,
  hints: { category?: string } = {},
): CreateIndexedItemInput | null {
  if (!event.id || !event.name) return null;

  const venue = event._embedded?.venues?.[0];
  const startsAt =
    event.dates?.start?.dateTime ??
    (event.dates?.start?.localDate
      ? `${event.dates.start.localDate}T${event.dates.start.localTime ?? "19:00:00"}`
      : undefined);
  const endsAt = event.dates?.end?.dateTime;
  // Once the event has started/ended it's no longer Radar-worthy.
  const expiresAt = endsAt ?? startsAt;

  const seg = event.classifications?.[0]?.segment?.name?.toLowerCase();
  const category =
    hints.category ??
    (seg === "music"
      ? "music"
      : seg === "sports"
        ? "sports"
        : seg === "arts & theatre"
          ? "culture"
          : "events");

  const lat = venue?.location?.latitude
    ? Number(venue.location.latitude)
    : undefined;
  const lng = venue?.location?.longitude
    ? Number(venue.location.longitude)
    : undefined;

  const tags = uniq(
    [
      "event",
      seg,
      event.classifications?.[0]?.genre?.name,
      event.classifications?.[0]?.subGenre?.name,
    ]
      .filter(isString)
      .map((t) => t.toLowerCase()),
  );

  const reasons: string[] = [];
  if (startsAt) reasons.push(`Starts ${formatEventDate(startsAt)}`);
  if (venue?.name) reasons.push(`At ${venue.name}`);

  return {
    type: category === "music" || category === "culture" ? "culture" : "event",
    destination: "radar",
    title: event.name,
    source: "events",
    sourceId: event.id,
    category,
    subtitle: venue?.name ?? event.classifications?.[0]?.genre?.name,
    description: event.info ?? event.description,
    locationName: venue?.name,
    address: [venue?.address?.line1, venue?.city?.name, venue?.state?.stateCode]
      .filter(Boolean)
      .join(", ") || undefined,
    lat,
    lng,
    startsAt,
    endsAt,
    expiresAt,
    url: event.url,
    imageUrl: bestImage(event.images),
    rawPayload: event as unknown as CreateIndexedItemInput["rawPayload"],
    status: "discovered",
    reasons,
    tags,
  };
}

export function normalizeTavilyResult(
  result: TavilySearchResult,
  hints: { category?: string; type?: IndexItemType } = {},
): CreateIndexedItemInput | null {
  if (!result.url || !result.title) return null;
  return {
    type: hints.type ?? "recommendation",
    destination: "radar",
    title: result.title,
    source: "research",
    sourceId: result.url,
    category: hints.category ?? "culture",
    description: result.content?.slice(0, 480),
    url: result.url,
    rawPayload: result as unknown as CreateIndexedItemInput["rawPayload"],
    status: "discovered",
    reasons: result.score != null ? [`Tavily relevance ${result.score.toFixed(2)}`] : [],
    tags: ["web", hints.category ?? "research"],
  };
}

export function normalizeBraveResult(
  result: BraveResult,
  hints: { category?: string; type?: IndexItemType } = {},
): CreateIndexedItemInput | null {
  if (!result.url || !result.title) return null;
  return {
    type: hints.type ?? "recommendation",
    destination: "radar",
    title: result.title,
    source: "research",
    sourceId: result.url,
    category: hints.category ?? "culture",
    description: result.description,
    url: result.url,
    rawPayload: result as unknown as CreateIndexedItemInput["rawPayload"],
    status: "discovered",
    reasons: [],
    tags: ["web", "brave", hints.category ?? "research"],
  };
}

export function normalizeShoppingResult(
  result: SerpShoppingResult,
): CreateIndexedItemInput | null {
  if (!result.title) return null;
  const url = result.product_link ?? result.link;
  return {
    type: "product",
    destination: "radar",
    title: result.title,
    source: "research",
    sourceId: result.product_id ?? url ?? result.title,
    category: "shopping",
    subtitle: [result.source, result.price].filter(Boolean).join(" · "),
    url,
    imageUrl: result.thumbnail,
    rawPayload: result as unknown as CreateIndexedItemInput["rawPayload"],
    status: "discovered",
    reasons: result.rating != null ? [`Rated ${result.rating}`] : [],
    tags: ["product", "shopping"],
  };
}

export function normalizeMlbGame(
  game: MlbGame,
  homeTeamId: number,
): CreateIndexedItemInput | null {
  if (!game.gamePk || !game.gameDate) return null;
  const isHome = game.teams.home.team.id === homeTeamId;
  const opponent = isHome ? game.teams.away.team.name : game.teams.home.team.name;
  const title = `${isHome ? "Home" : "Away"} vs. ${opponent}`;
  const venue = game.venue?.name;
  return {
    type: "event",
    destination: "radar",
    title,
    source: "events",
    sourceId: String(game.gamePk),
    category: "sports",
    subtitle: venue ?? (isHome ? "Home game" : "Away game"),
    locationName: venue,
    startsAt: game.gameDate,
    expiresAt: game.gameDate,
    rawPayload: game as unknown as CreateIndexedItemInput["rawPayload"],
    status: "discovered",
    reasons: [
      `${isHome ? "Home" : "Away"} game vs ${opponent}`,
      `On ${formatEventDate(game.gameDate)}`,
    ],
    tags: ["sports", "mlb", isHome ? "home" : "away"],
  };
}

// ------- helpers -------

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function priceTag(level: NonNullable<GooglePlace["priceLevel"]>): string {
  switch (level) {
    case "PRICE_LEVEL_FREE":
      return "free";
    case "PRICE_LEVEL_INEXPENSIVE":
      return "$";
    case "PRICE_LEVEL_MODERATE":
      return "$$";
    case "PRICE_LEVEL_EXPENSIVE":
      return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "$$$$";
  }
}

function bestImage(
  images?: { url: string; ratio?: string; width?: number; height?: number }[],
): string | undefined {
  if (!images?.length) return undefined;
  const sixteen = images.find((i) => i.ratio === "16_9");
  return (sixteen ?? images[0]).url;
}

function formatEventDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
