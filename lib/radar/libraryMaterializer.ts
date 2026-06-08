import "server-only";

import { RADAR_UNDERFILLED_PROMOTION_FLOOR } from "@/lib/brain/constants";
import { scoreCategoryCouncil } from "@/lib/brain/categoryCouncils";
import {
  normalizeRadarClassification,
  type RadarCategory,
  typeForRadarCategory,
} from "@/lib/radar/category";
import { pillarsForItem } from "@/lib/radar/engine/pillars";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { isEngineOwnedCategory } from "@/lib/radar/engine/ownership";
import type { IndexedItem } from "@/lib/index/types";
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
const DEFAULT_MAX_INSERTIONS_PER_CALL = 16;
/**
 * Enrichment states we treat as "done enriching, safe to surface". `enriched`
 * is the happy path; `nothing_to_fill` (the row already had everything) and
 * `no_place_match` (Google had no match, but the taste verdict still stands)
 * are terminal-OK — excluding them stranded ~40 good A/B items forever. The
 * shown-gate (categoryDataReady, in promoteHoldingWithService) is the real
 * quality control, so widening here only deepens the discovered pool, never
 * the visible board.
 */
const MATERIALIZE_ENRICHMENT_STATES = ["enriched", "nothing_to_fill", "no_place_match"];
const STUB_VERDICT_MARKER = "Converted from Candidate Inbox";

export async function materializeEligibleLibraryItems(
  userId: string,
  opts: { maxInsertions?: number } = {},
): Promise<MaterializerResult> {
  const supabase = getSupabaseServiceClient();
  const maxInsertions = opts.maxInsertions ?? DEFAULT_MAX_INSERTIONS_PER_CALL;
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
      .in("enrichment_status", MATERIALIZE_ENRICHMENT_STATES)
      .in("quality_tier", ["A", "B"])
      .gte("quality_score", RADAR_UNDERFILLED_PROMOTION_FLOOR)
      // Never-surfaced first (last_surfaced_at NULL), then least-recently
      // surfaced, then by quality. A plain quality_score DESC + small limit let
      // the already-surfaced top-scorers fill the window every run, so the
      // unsurfaced tail never got fetched. Limit comfortably exceeds the
      // eligible pool so nothing is stranded below the cut.
      .order("last_surfaced_at", { ascending: true, nullsFirst: true })
      .order("quality_score", { ascending: false })
      .limit(120),
    supabase
      .from("current_events")
      .select("id, title, event_type, venue_name, starts_at, ends_at, ticket_url, price_level, vibe_keywords, description, verdict, verdict_strength, library_place_id")
      .eq("user_id", userId)
      .eq("status", "verified")
      .gt("starts_at", new Date().toISOString())
      .lt("starts_at", new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString())
      .not("ticket_url", "is", null)
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
    if (rows.length >= maxInsertions) {
      result.skipped++;
      return;
    }
    existingSourceIds.add(sourceId);
    rows.push(row);
  };

  // Remember each place's prior surface count so we can stamp lifecycle fields
  // (last_surfaced_at / times_surfaced) back onto the rows we actually surface.
  // Without this, rotation/dedup can't tell fresh from stale and re-runs churn.
  const placeTimesById = new Map<string, number>();
  for (const place of places) {
    // Engine-owned lanes (dining) are materialized by the curation engine — the
    // old library materializer must not also produce them (it would clutter the
    // discovered pool and fight the engine's shelf).
    if (isEngineOwnedCategory(deriveCategory(place))) {
      result.skipped++;
      continue;
    }
    placeTimesById.set(place.id, place.times_surfaced ?? 0);
    maybeQueue(place.id, buildPlaceSurfaceRow(userId, place));
  }

  for (const event of events) {
    const row = buildEventSurfaceRow(userId, event);
    if (row) {
      maybeQueue(event.id, row);
    } else {
      result.skipped++;
    }
  }

  const surfacedPlaceIds: string[] = [];
  for (const row of rows) {
    try {
      const { error } = await supabase
        .from("surfaced_items")
        .insert(row);
      if (error) {
        result.errors.push(`${row.title ?? row.source_id ?? "library item"}: ${error.message}`);
      } else {
        result.materialized++;
        if (typeof row.source_id === "string" && placeTimesById.has(row.source_id)) {
          surfacedPlaceIds.push(row.source_id);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${row.title ?? row.source_id ?? "library item"}: ${message}`);
    }
  }

  // Stamp lifecycle fields on the library places we just surfaced (events live
  // in current_events, which has no such columns — places only).
  const surfacedAt = new Date().toISOString();
  for (const placeId of surfacedPlaceIds) {
    await supabase
      .from("places_library")
      .update({
        last_surfaced_at: surfacedAt,
        times_surfaced: (placeTimesById.get(placeId) ?? 0) + 1,
      })
      .eq("id", placeId)
      .eq("user_id", userId);
  }

  // Back-fill enrichment data (image, address, coords) into already-surfaced rows
  // that were created before a library place was fully enriched by Google Places.
  const newlyInsertedIds = new Set(rows.map((r) => r.source_id).filter(Boolean));
  for (const place of places) {
    if (newlyInsertedIds.has(place.id)) continue; // just inserted — skip
    if (!existingSourceIds.has(place.id)) continue; // not surfaced yet — skip

    // Push address/coords unconditionally — only fill image if not already set
    // (the plan page may have scraped a richer image we don't want to overwrite).
    const imageUpdates: Record<string, unknown> = {};
    const coordUpdates: Record<string, unknown> = {};
    const hasImage =
      typeof place.image_url === "string" && place.image_url.startsWith("http");
    if (hasImage) imageUpdates.image_url = place.image_url;
    if (place.address) coordUpdates.address = place.address;
    if (place.lat != null) coordUpdates.lat = place.lat;
    if (place.lng != null) coordUpdates.lng = place.lng;

    // Coords: always overwrite — nothing else sets them on surfaced_items.
    if (Object.keys(coordUpdates).length > 0) {
      await supabase
        .from("surfaced_items")
        .update(coordUpdates)
        .eq("user_id", userId)
        .eq("source_id", place.id)
        .eq("source", MATERIALIZER_SOURCE);
    }
    // Image: only fill if the row doesn't already have one.
    if (Object.keys(imageUpdates).length > 0) {
      await supabase
        .from("surfaced_items")
        .update(imageUpdates)
        .eq("user_id", userId)
        .eq("source_id", place.id)
        .eq("source", MATERIALIZER_SOURCE)
        .is("image_url", null);
    }
  }

  return result;
}

function buildPlaceSurfaceRow(userId: string, place: PlacesLibraryRow): SurfacedItemInsert {
  const category = deriveCategory(place);
  const type = category ? typeForRadarCategory(category) : "place";
  const pillarTags = pillarsForItem({
    category,
    lane: category,
    tags: place.vibe_keywords ?? [],
    title: place.name,
  });
  return {
    user_id: userId,
    destination: "radar",
    status: "discovered",
    source: MATERIALIZER_SOURCE,
    source_id: place.id,
    type,
    category,
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
      pillar_tags: pillarTags,
    } satisfies Json,
  };
}

function deriveCategory(place: {
  place_type?: string | null;
  cuisine_or_focus?: string | null;
  vibe_keywords?: string[] | null;
  name: string;
}): RadarCategory | null {
  return normalizeRadarClassification({
    category: place.place_type,
    type: place.place_type,
    title: place.name,
    placeType: place.place_type,
    description: place.cuisine_or_focus,
    tags: place.vibe_keywords ?? [],
    sourcePayload: {
      place_type: place.place_type,
      cuisine_or_focus: place.cuisine_or_focus,
      vibe_keywords: place.vibe_keywords,
    },
  }).category;
}

function buildEventSurfaceRow(userId: string, event: CurrentEventRow): SurfacedItemInsert | null {
  if (!hasOfficialEventTime(event.starts_at) || !event.venue_name?.trim() || !isHttpUrl(event.ticket_url)) {
    return null;
  }
  const council = scoreCategoryCouncil(eventIndexedItem(event), "events");
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
    source_label: council.sourceLabel ?? null,
    reasons: event.vibe_keywords ?? [],
    tags: event.vibe_keywords ?? [],
    payload: {
      source_layer: "current_events",
      event_type: event.event_type,
      ticket_url: event.ticket_url,
      source_label: council.sourceLabel ?? null,
      category_council: {
        category: council.category,
        score: council.score,
        signals: council.signals,
        flags: council.flags,
      },
      official_starts_at: event.starts_at,
      event_time_locked: true,
      price_level: event.price_level,
      library_place_id: event.library_place_id,
      pillar_tags: pillarsForItem({
        category: "events",
        lane: "events",
        tags: event.vibe_keywords ?? [],
        title: event.title,
      }),
    } satisfies Json,
  };
}

function eventIndexedItem(event: CurrentEventRow): IndexedItem {
  const now = new Date().toISOString();
  return {
    id: event.id,
    source: "events",
    sourceId: event.id,
    type: "event",
    category: "events",
    title: event.title,
    subtitle: event.venue_name,
    description: event.verdict ?? event.description ?? undefined,
    locationName: event.venue_name,
    startsAt: event.starts_at,
    endsAt: event.ends_at ?? undefined,
    url: event.ticket_url ?? undefined,
    rawPayload: {
      source_layer: "current_events",
      ticket_url: event.ticket_url,
      event_type: event.event_type,
    } satisfies Json,
    status: "discovered",
    destination: "radar",
    score: event.verdict_strength ?? undefined,
    reasons: event.vibe_keywords ?? [],
    tags: event.vibe_keywords ?? [],
    createdAt: event.created_at ?? now,
    updatedAt: event.updated_at ?? now,
  };
}

function hasOfficialEventTime(value: string | null | undefined): value is string {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return !/T00:00(?::00(?:\.000)?)?(?:Z|[+-]\d\d:?\d\d)?$/i.test(value);
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}
