import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasGooglePlaces,
  searchPlaceForEnrichment,
  resolvePhotoUri,
  type GooglePlace,
} from "@/lib/sources/googlePlaces";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { DINING_SUBLIBRARIES } from "@/lib/radar/engine/sources";

/** Stage 5 — deep enrich finalists with Google Places (geo, hours, price, hero
 *  photo). Only finalists lacking a google_place_id are touched, so it runs once
 *  per item. A miss is left for a later retry (not a hard rejection) — better a
 *  card with no image than dropping a genuinely good venue over a transient
 *  text-search miss. Reuses lib/sources/googlePlaces (per the plan's reuse map). */

// Modest per-cycle budget (keeps the full chain well under maxDuration). The
// backfill of existing judged rows completes over a couple cycles; comparative
// only promotes already-enriched rows, so nothing is stranded imageless.
const ENRICH_LIMIT = 12;

export type EnrichResult = {
  subLibrary: string;
  attempted: number;
  enriched: number;
  missed: number;
  errors: string[];
};

type FinalistRow = {
  id: string;
  name: string;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
};

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

export async function enrichSubLibrary(input: {
  userId: string;
  subLibrary: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<EnrichResult> {
  const config = DINING_SUBLIBRARIES[input.subLibrary];
  const result: EnrichResult = {
    subLibrary: input.subLibrary,
    attempted: 0,
    enriched: 0,
    missed: 0,
    errors: [],
  };
  if (!config) {
    result.errors.push(`Unknown sub-library: ${input.subLibrary}`);
    return result;
  }
  if (!hasGooglePlaces()) {
    result.errors.push("GOOGLE_PLACES_API_KEY not set — enrich skipped");
    return result;
  }
  const supabase = input.supabase ?? getSupabaseServiceClient();

  // Enrich fresh finalists AND any already-judged rows that predate this stage
  // (backfill) — both still lack a google_place_id. enrich runs before
  // comparative, so judged rows get their geo/photo threaded into category_best
  // this same cycle.
  const { data, error } = await supabase
    .from(config.subLibrary)
    .select("id, name, neighborhood, lat, lng")
    .eq("user_id", input.userId)
    .in("status", ["finalist", "judged"])
    .is("google_place_id", null)
    .limit(input.limit ?? ENRICH_LIMIT);
  if (error) {
    result.errors.push(`read finalists: ${error.message}`);
    return result;
  }
  const rows = (data ?? []) as FinalistRow[];
  if (rows.length === 0) return result;

  for (const row of rows) {
    result.attempted += 1;
    let place: GooglePlace | null = null;
    try {
      const query = `${row.name}${row.neighborhood ? ` ${row.neighborhood}` : ""} Chicago`;
      place = await searchPlaceForEnrichment({
        query,
        lat: row.lat ?? undefined,
        lng: row.lng ?? undefined,
      });
    } catch (err) {
      result.errors.push(`search ${row.name}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (!place) {
      result.missed += 1;
      continue; // leave for a later retry — not a hard rejection
    }

    // Resolve a hero image from the first usable photo.
    let imageUrl: string | null = null;
    const photoNames = (place.photos ?? []).map((p) => p.name).filter(Boolean).slice(0, 3);
    for (const photoName of photoNames) {
      imageUrl = await resolvePhotoUri({ photoName, maxWidthPx: 1080 });
      if (imageUrl) break;
    }

    const update: Record<string, unknown> = {
      google_place_id: place.id,
      address: place.formattedAddress ?? place.shortFormattedAddress ?? null,
      lat: place.location?.latitude ?? row.lat ?? null,
      lng: place.location?.longitude ?? row.lng ?? null,
      price_level: place.priceLevel ? PRICE_MAP[place.priceLevel] ?? null : null,
      hours: place.currentOpeningHours?.weekdayDescriptions?.join("\n")
        ?? place.regularOpeningHours?.weekdayDescriptions?.join("\n")
        ?? null,
      reservation_required: place.reservable ?? null,
      photo_urls: imageUrl ? [imageUrl] : [],
      last_seen_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from(config.subLibrary)
      .update(update)
      .eq("id", row.id)
      .eq("user_id", input.userId);
    if (upErr) result.errors.push(`enrich ${row.name}: ${upErr.message}`);
    else result.enriched += 1;
  }
  return result;
}

export async function enrichDining(input: {
  userId: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<EnrichResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: EnrichResult[] = [];
  for (const subLibrary of Object.keys(DINING_SUBLIBRARIES)) {
    out.push(await enrichSubLibrary({ userId: input.userId, subLibrary, supabase, limit: input.limit }));
  }
  return out;
}
