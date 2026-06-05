import "server-only";

import { RADAR_UNDERFILLED_PROMOTION_FLOOR } from "@/lib/brain/constants";
import { normalizeRadarCategory } from "@/lib/radar/category";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type {
  CurrentEventRow,
  Json,
  PlacesLibraryRow,
  SurfacedItemInsert,
} from "@/lib/types/database";

type MaterializerResult = {
  materialized: number;
  skipped: number;
  errors: string[];
};

const MATERIALIZER_SOURCE = "library_materializer";
const MAX_INSERTIONS_PER_CALL = 16;
const STUB_VERDICT_MARKER = "Converted from Candidate Inbox";

export async function materializeEligibleLibraryItems(
  userId: string,
): Promise<MaterializerResult> {
  const supabase = getSupabaseServiceClient();
  const result: MaterializerResult = {
    materialized: 0,
    skipped: 0,
    errors: [],
  };

  const [
    placesRes,
    eventsRes,
    existingRes,
  ] = await Promise.all([
    supabase
      .from("places_library")
      .select("id, name, slug, place_type, neighborhood, address, lat, lng, cuisine_or_focus, price_level, hours_summary, vibe_keywords, best_for, verdict, verdict_strength, quality_tier, quality_score, seasonal_notes, last_surfaced_at, times_surfaced, image_url")
      .eq("user_id", userId)
      .eq("enrichment_status", "enriched")
      .in("quality_tier", ["A", "B"])
      .gte("quality_score", RADAR_UNDERFILLED_PROMOTION_FLOOR)
      .order("quality_score", { ascending: false })
      .limit(40),
    supabase
      .from("current_events")
      .select("id, title, event_type, venue_name, starts_at, ends_at, ticket_url, price_level, vibe_keywords, description, verdict, verdict_strength, library_place_id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .gt("starts_at", new Date().toISOString())
      .lt("starts_at", new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString())
      .gte("verdict_strength", RADAR_UNDERFILLED_PROMOTION_FLOOR)
      .order("starts_at", { ascending: true })
      .limit(20),
    supabase
      .from("surfaced_items")
      .select("source_id")
      .eq("user_id", userId)
      .eq("source", MATERIALIZER_SOURCE)
      .not("source_id", "is", null)
      .not("status", "in", "(archived,passed)"),
  ]);

  if (placesRes.error) result.errors.push(`fetch places_library: ${placesRes.error.message}`);
  if (eventsRes.error) result.errors.push(`fetch current_events: ${eventsRes.error.message}`);
  if (existingRes.error) result.errors.push(`fetch existing surfaced_items: ${existingRes.error.message}`);
  if (placesRes.error || eventsRes.error || existingRes.error) return result;

  const existingSourceIds = new Set(
    ((existingRes.data ?? []) as Array<{ source_id: string | null }>)
      .map((row) => row.source_id)
      .filter((sourceId): sourceId is string => typeof sourceId === "string" && sourceId.length > 0),
  );

  const rows: SurfacedItemInsert[] = [];
  const places = ((placesRes.data ?? []) as PlacesLibraryRow[]).filter((place) => {
    const verdict = typeof place.verdict === "string" ? place.verdict : "";
    return !verdict.includes(STUB_VERDICT_MARKER);
  });
  const events = (eventsRes.data ?? []) as CurrentEventRow[];

  const maybeQueue = (sourceId: string, row: SurfacedItemInsert) => {
    if (existingSourceIds.has(sourceId)) {
      result.skipped++;
      return;
    }
    if (rows.length >= MAX_INSERTIONS_PER_CALL) {
      result.skipped++;
      return;
    }
    existingSourceIds.add(sourceId);
    rows.push(row);
  };

  for (const place of places) {
    maybeQueue(place.id, buildPlaceSurfaceRow(userId, place));
  }

  for (const event of events) {
    maybeQueue(event.id, buildEventSurfaceRow(userId, event));
  }

  for (const row of rows) {
    try {
      const { error } = await supabase
        .from("surfaced_items")
        .insert(row);
      if (error) {
        result.errors.push(`${row.title ?? row.source_id ?? "library item"}: ${error.message}`);
      } else {
        result.materialized++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${row.title ?? row.source_id ?? "library item"}: ${message}`);
    }
  }

  return result;
}

function buildPlaceSurfaceRow(userId: string, place: PlacesLibraryRow): SurfacedItemInsert {
  return {
    user_id: userId,
    destination: "radar",
    status: "discovered",
    source: MATERIALIZER_SOURCE,
    source_id: place.id,
    type: "place",
    category: deriveCategory(place),
    title: place.name,
    subtitle: place.neighborhood ?? null,
    description: place.verdict ?? null,
    location_name: place.name,
    address: place.address ?? null,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    url: null,
    image_url:
      typeof place.image_url === "string" && place.image_url.startsWith("http")
        ? place.image_url
        : null,
    score: place.quality_score ?? null,
    reasons: place.best_for ?? [],
    tags: place.vibe_keywords ?? [],
    payload: {
      source_layer: "places_library",
      library_place_id: place.id,
      quality_tier: place.quality_tier,
      cuisine_or_focus: place.cuisine_or_focus,
      price_level: place.price_level,
      seasonal_notes: place.seasonal_notes,
      times_surfaced: place.times_surfaced,
    } satisfies Json,
  };
}

function deriveCategory(place: {
  place_type?: string | null;
  cuisine_or_focus?: string | null;
  vibe_keywords?: string[] | null;
  name: string;
}): string | null {
  // place_type is unreliable because bulk conversion historically defaulted it
  // to "restaurant", so only trust explicit non-default values.
  if (place.place_type && place.place_type !== "restaurant") {
    return normalizeRadarCategory(place.place_type);
  }
  const signal = [
    place.cuisine_or_focus ?? "",
    ...(place.vibe_keywords ?? []),
    place.name,
  ]
    .join(" ")
    .toLowerCase();
  return normalizeRadarCategory(signal);
}

function buildEventSurfaceRow(userId: string, event: CurrentEventRow): SurfacedItemInsert {
  return {
    user_id: userId,
    destination: "radar",
    status: "discovered",
    source: MATERIALIZER_SOURCE,
    source_id: event.id,
    type: "event",
    category: "events",
    title: event.title,
    subtitle: event.venue_name,
    description: event.verdict ?? event.description ?? null,
    location_name: event.venue_name,
    address: null,
    lat: null,
    lng: null,
    starts_at: event.starts_at,
    ends_at: event.ends_at ?? null,
    url: event.ticket_url ?? null,
    image_url: null,
    score: event.verdict_strength ?? null,
    reasons: event.vibe_keywords ?? [],
    tags: event.vibe_keywords ?? [],
    payload: {
      source_layer: "current_events",
      event_type: event.event_type,
      ticket_url: event.ticket_url,
      price_level: event.price_level,
      library_place_id: event.library_place_id,
    } satisfies Json,
  };
}
