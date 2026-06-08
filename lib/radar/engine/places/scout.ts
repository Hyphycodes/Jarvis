import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { normalizeRadarClassification } from "@/lib/radar/category";
import { normalizeExternalId } from "@/lib/radar/engine/curation";
import { classifyPlaceSubLibrary } from "@/lib/radar/engine/places/config";
import type { PlacesLibraryRow } from "@/lib/types/database";

/**
 * Places scout — SEEDS the places_items warehouse from places_library's
 * place-category rows (per jarvis-places-engine-brain-tree.md: reuse, don't
 * duplicate). places_library already holds 400+ researched venues with verdicts,
 * coords, and images; we pull the ones that classify as the Places lane (not
 * dining/culture/events/moves) into places_items as candidates. Instant inventory.
 */

export type PlacesScoutResult = { scanned: number; added: number; skippedExisting: number; skippedNonPlace: number };

export async function seedPlacesFromLibrary(input: {
  userId: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<PlacesScoutResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const result: PlacesScoutResult = { scanned: 0, added: 0, skippedExisting: 0, skippedNonPlace: 0 };

  const { data: libRows, error } = await supabase
    .from("places_library")
    .select(
      "id, name, slug, place_type, neighborhood, address, lat, lng, cuisine_or_focus, price_level, hours_summary, vibe_keywords, best_for, verdict, verdict_strength, quality_score, image_url",
    )
    .eq("user_id", input.userId)
    .order("verdict_strength", { ascending: false, nullsFirst: false })
    .limit(input.limit ?? 400);
  if (error || !libRows) return result;

  const { data: existingRows } = await supabase
    .from("places_items")
    .select("external_id, library_place_id")
    .eq("user_id", input.userId)
    .limit(2000);
  const existing = new Set<string>();
  for (const r of (existingRows ?? []) as Array<{ external_id: string | null; library_place_id: string | null }>) {
    if (r.external_id) existing.add(r.external_id);
    if (r.library_place_id) existing.add(`lib:${r.library_place_id}`);
  }

  const rows: Array<Record<string, unknown>> = [];
  const batchSeen = new Set<string>();
  for (const place of libRows as PlacesLibraryRow[]) {
    result.scanned += 1;
    // Only rows that the canonical classifier routes to the Places lane.
    const category = normalizeRadarClassification({
      category: place.place_type,
      type: place.place_type,
      title: place.name,
      placeType: place.place_type,
      description: place.cuisine_or_focus,
      tags: place.vibe_keywords ?? [],
      sourcePayload: { place_type: place.place_type, cuisine_or_focus: place.cuisine_or_focus, vibe_keywords: place.vibe_keywords },
    }).category;
    if (category !== "places") {
      result.skippedNonPlace += 1;
      continue;
    }
    const externalId = normalizeExternalId(`${place.name}-${place.neighborhood ?? ""}`);
    if (existing.has(externalId) || existing.has(`lib:${place.id}`) || batchSeen.has(externalId)) {
      result.skippedExisting += 1;
      continue;
    }
    batchSeen.add(externalId);

    const sub = classifyPlaceSubLibrary({
      title: place.name,
      place_type: place.place_type,
      description: place.cuisine_or_focus,
      vibe_keywords: place.vibe_keywords ?? [],
    });
    rows.push({
      user_id: input.userId,
      external_id: externalId,
      source: "places_library_seed",
      library_place_id: place.id,
      title: place.name,
      description: place.verdict ?? place.cuisine_or_focus ?? null,
      place_type: place.place_type,
      sub_library: sub,
      neighborhood: place.neighborhood ?? null,
      address: place.address ?? null,
      lat: place.lat ?? null,
      lng: place.lng ?? null,
      image_url: typeof place.image_url === "string" && place.image_url.startsWith("http") ? place.image_url : null,
      vibe_keywords: place.vibe_keywords ?? [],
      best_for: place.best_for ?? [],
      verdict: place.verdict ?? null,
      verdict_strength: place.verdict_strength ?? null,
      quality_score: place.quality_score ?? null,
      status: "discovered",
    });
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("places_items").insert(rows);
    if (!insErr) result.added = rows.length;
  }
  return result;
}
