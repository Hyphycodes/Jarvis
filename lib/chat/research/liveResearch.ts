import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { createIndexItem } from "@/lib/index/repo";
import { searchWeb, hasTavily } from "@/lib/sources/tavily";
import {
  searchPlaces,
  resolvePhotoUri,
  hasGooglePlaces,
  type GooglePlace,
} from "@/lib/sources/googlePlaces";
import { getDefaultLocation } from "@/lib/env";
import type { ResearchPlace } from "@/lib/chat/types";

export type LiveResearchResult = {
  /** Tavily's synthesized answer — the ground truth the brain writes from. */
  answer: string | null;
  /** Up to 4 real, materialized places the user can act on. */
  places: ResearchPlace[];
  /** Compact source lines (title + url) for grounding, not shown raw. */
  sources: { title: string; url: string }[];
};

const MAX_PLACES = 4;

/**
 * The live operating desk: research a recommendation/discovery ask BEFORE the
 * brain answers. Runs Tavily (synthesized answer) and Google Places (real
 * venues) in parallel, resolves one photo per place server-side, and
 * materializes each place into surfaced_items so it has a real detail route.
 *
 * Speed and truth: Tavily returns a synthesized answer in ~1s; Places returns
 * ranked venues. The brain then writes a confident, positioned take grounded in
 * what was actually found instead of guessing from its priors.
 */
export async function runLiveResearch(input: {
  userId: string;
  query: string;
  city?: string | null;
  lat?: number;
  lng?: number;
  /** When false, skip materialization (e.g. a pure "is it open" lookup). */
  surfacePlaces?: boolean;
}): Promise<LiveResearchResult> {
  const surface = input.surfacePlaces !== false;
  const loc = safeDefaultLocation();
  const lat = input.lat ?? loc?.lat;
  const lng = input.lng ?? loc?.lng;
  const city = input.city ?? loc?.city ?? null;
  const placeQuery = city ? `${input.query} ${city}` : input.query;

  const [answerRes, placesRes] = await Promise.allSettled([
    hasTavily()
      ? searchWeb({ query: placeQuery, maxResults: 6 })
      : Promise.resolve(null),
    surface && hasGooglePlaces()
      ? searchPlaces({ query: placeQuery, lat, lng, maxResults: 8 })
      : Promise.resolve([] as GooglePlace[]),
  ]);

  const answer =
    answerRes.status === "fulfilled" && answerRes.value?.answer
      ? answerRes.value.answer.trim()
      : null;
  const sources =
    answerRes.status === "fulfilled" && answerRes.value
      ? answerRes.value.results.slice(0, 5).map((r) => ({ title: r.title, url: r.url }))
      : [];

  const rawPlaces =
    placesRes.status === "fulfilled" ? placesRes.value : [];

  const chosen = pickPlaces(rawPlaces);
  const places: ResearchPlace[] = [];
  if (chosen.length) {
    const supabase = await getServerSupabase();
    const resolved = await Promise.all(
      chosen.map((place) => materializePlace({ userId: input.userId, place, supabase })),
    );
    for (const p of resolved) if (p) places.push(p);
  }

  return { answer, places, sources };
}

function safeDefaultLocation() {
  try {
    return getDefaultLocation();
  } catch {
    return null;
  }
}

/**
 * Rank and trim raw Google results: prefer well-reviewed, photographed venues,
 * skip the long tail. Google returns rough relevance order, so we keep that but
 * drop entries with no rating signal at all.
 */
function pickPlaces(raw: GooglePlace[]): GooglePlace[] {
  const scored = raw
    .filter((p) => p.displayName?.text)
    .map((p) => ({
      place: p,
      score:
        (p.rating ?? 0) * Math.log10((p.userRatingCount ?? 0) + 10) +
        (p.photos?.length ? 1.5 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_PLACES).map((s) => s.place);
}

async function materializePlace(input: {
  userId: string;
  place: GooglePlace;
  supabase: Awaited<ReturnType<typeof getServerSupabase>>;
}): Promise<ResearchPlace | null> {
  const { place } = input;
  const name = place.displayName?.text?.trim();
  if (!name) return null;

  const neighborhood = deriveNeighborhood(place);
  const priceTier = priceLevelToTier(place.priceLevel);
  const hook = deriveHook(place, neighborhood);
  const photoName = place.photos?.[0]?.name;
  const photoUrl = photoName
    ? await resolvePhotoUri({ photoName, maxWidthPx: 720 }).catch(() => null)
    : null;

  // Reuse an existing materialized place by name so repeated/adjacent searches
  // resolve to the same detail route instead of piling up duplicates.
  const existingId = await findExistingPlace(input.userId, name, input.supabase);
  if (existingId) {
    return { itemId: existingId, name, neighborhood, hook, priceTier, photoUrl, placeId: place.id };
  }

  try {
    const item = await createIndexItem({
      type: isDining(place) ? "restaurant" : "place",
      destination: "radar",
      source: "research",
      sourceId: place.id,
      category: isDining(place) ? "dining" : "places",
      title: name,
      subtitle: [neighborhood, priceTier].filter(Boolean).join(" · ") || undefined,
      description: place.editorialSummary?.text ?? hook,
      locationName: neighborhood ?? undefined,
      address: place.formattedAddress ?? place.shortFormattedAddress ?? undefined,
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      url: place.websiteUri ?? place.googleMapsUri ?? undefined,
      imageUrl: photoUrl ?? undefined,
      score: place.rating ?? undefined,
      status: "discovered",
      tags: ["chat_research", isDining(place) ? "dining" : "place"],
      reasons: [hook].filter(Boolean),
      rawPayload: {
        source_kind: "chat_live_research",
        google_place_id: place.id,
        price_tier: priceTier,
        rating: place.rating ?? null,
        user_rating_count: place.userRatingCount ?? null,
        editorial_summary: place.editorialSummary?.text ?? null,
      },
    });
    return { itemId: item.id, name, neighborhood, hook, priceTier, photoUrl, placeId: place.id };
  } catch (err) {
    console.error("[liveResearch] materialize failed", { name, err });
    return null;
  }
}

async function findExistingPlace(
  userId: string,
  name: string,
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("surfaced_items")
      .select("id")
      .eq("user_id", userId)
      .eq("destination", "radar")
      .ilike("title", name)
      .limit(1);
    return ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
  } catch {
    return null;
  }
}

function isDining(place: GooglePlace): boolean {
  const t = `${place.primaryType ?? ""} ${(place.types ?? []).join(" ")}`.toLowerCase();
  return /restaurant|food|cafe|coffee|bar|bakery|meal|dining|steak|sushi|ramen/.test(t);
}

function priceLevelToTier(level: GooglePlace["priceLevel"]): string | null {
  switch (level) {
    case "PRICE_LEVEL_INEXPENSIVE":
      return "$";
    case "PRICE_LEVEL_MODERATE":
      return "$$";
    case "PRICE_LEVEL_EXPENSIVE":
      return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "$$$$";
    default:
      return null;
  }
}

/** A short, sharp hook for the card. Editorial summary when present, else built
 *  from type + neighborhood + rating so the strip never shows a bare name. */
function deriveHook(place: GooglePlace, neighborhood: string | null): string {
  const editorial = place.editorialSummary?.text?.trim();
  if (editorial) return clip(editorial, 90);
  const kind = place.primaryTypeDisplayName?.text ?? prettyType(place.primaryType);
  const bits: string[] = [];
  if (kind) bits.push(kind);
  if (neighborhood) bits.push(neighborhood);
  if (place.rating && (place.userRatingCount ?? 0) > 30) {
    bits.push(`${place.rating.toFixed(1)}★`);
  }
  return bits.join(" · ") || "Worth a look.";
}

function prettyType(type?: string): string | null {
  if (!type) return null;
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Best-effort neighborhood/locality from the formatted address. */
function deriveNeighborhood(place: GooglePlace): string | null {
  const addr = place.shortFormattedAddress ?? place.formattedAddress;
  if (!addr) return null;
  const parts = addr.split(",").map((p) => p.trim()).filter(Boolean);
  // "123 W Foo St, Chicago, IL 60607" → take the locality segment.
  if (parts.length >= 2) return parts[parts.length - 2] || parts[0];
  return parts[0] ?? null;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
