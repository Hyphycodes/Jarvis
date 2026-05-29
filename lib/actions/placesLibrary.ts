"use server";

import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { buildBrainContext } from "@/lib/brain/context";
import { researchPlace, type ResearcherOutput } from "@/lib/brain/researcher";
import { writeVerdict, type VerdictOutput } from "@/lib/brain/verdictWriter";
import type { PlacesLibraryRow } from "@/lib/types/database";

const LIBRARY_FRESHNESS_DAYS = 30;

function makeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isFresh(lastResearched: string): boolean {
  const ms = Date.now() - new Date(lastResearched).getTime();
  return ms < LIBRARY_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
}

export async function researchAndStore(
  name: string,
  context?: { discoveredUrl?: string; snippet?: string },
): Promise<{ libraryId: string; dossier: ResearcherOutput; verdict: VerdictOutput }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  const slug = makeSlug(name);

  // Return fresh existing entry if available
  const { data: existing } = await supabase
    .from("places_library")
    .select("*")
    .eq("user_id", owner.id)
    .eq("slug", slug)
    .maybeSingle();

  if (existing && isFresh(existing.last_researched_at)) {
    return {
      libraryId: existing.id,
      dossier: {
        canonical_name: existing.name,
        slug: existing.slug,
        place_type: (existing.place_type as ResearcherOutput["place_type"]) ?? "restaurant",
        neighborhood: existing.neighborhood,
        cuisine_or_focus: existing.cuisine_or_focus ?? "",
        price_level: (existing.price_level as ResearcherOutput["price_level"]) ?? "unknown",
        hours_summary: existing.hours_summary ?? "",
        vibe_keywords: existing.vibe_keywords ?? [],
        sources_cited: (existing.sources_cited as ResearcherOutput["sources_cited"]) ?? [],
        events_observed: (existing.events_observed as ResearcherOutput["events_observed"]) ?? [],
        seasonal_notes: existing.seasonal_notes,
        confidence: existing.verdict_strength ?? 0.3,
        uncertainties: [],
      },
      verdict: {
        verdict: existing.verdict ?? "No verdict yet.",
        verdict_strength: existing.verdict_strength ?? 0,
        best_for: existing.best_for ?? [],
        not_for: existing.not_for ?? [],
        compared_to: existing.compared_to,
        surface_priority: "medium",
        surface_reasoning: "Returning cached entry.",
      },
    };
  }

  // Research the place
  const dossier = await researchPlace(name, context);

  // Build brain context for the verdict writer (no weather needed)
  const brainContext = await buildBrainContext({ includeWeather: false });

  // Write the verdict
  const verdict = await writeVerdict(dossier, brainContext);

  const now = new Date().toISOString();
  const row = {
    user_id: owner.id,
    name: dossier.canonical_name,
    slug: dossier.slug,
    // place_type: guard against Claude omitting the field — default to "restaurant"
    place_type: dossier.place_type ?? "restaurant",
    neighborhood: dossier.neighborhood,
    address: null as string | null,
    lat: null as number | null,
    lng: null as number | null,
    cuisine_or_focus: dossier.cuisine_or_focus,
    price_level: dossier.price_level === "unknown" ? null : dossier.price_level,
    hours_summary: dossier.hours_summary,
    vibe_keywords: dossier.vibe_keywords,
    sources_cited: dossier.sources_cited as unknown,
    verdict: verdict.verdict,
    verdict_strength: verdict.verdict_strength,
    best_for: verdict.best_for,
    not_for: verdict.not_for,
    compared_to: verdict.compared_to,
    events_observed: dossier.events_observed as unknown,
    seasonal_notes: dossier.seasonal_notes,
    last_researched_at: now,
    last_refreshed_at: now,
    updated_at: now,
  };

  // Upsert on (user_id, slug)
  const { data: upserted, error } = await supabase
    .from("places_library")
    .upsert(row, { onConflict: "user_id,slug" })
    .select("id")
    .single();

  if (error) {
    throw new Error(`places_library upsert failed: ${error.message}`);
  }

  return { libraryId: (upserted as { id: string }).id, dossier, verdict };
}

export async function getLibraryEntryByName(
  name: string,
): Promise<PlacesLibraryRow | null> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const slug = makeSlug(name);

  const { data } = await supabase
    .from("places_library")
    .select("*")
    .eq("user_id", owner.id)
    .eq("slug", slug)
    .maybeSingle();

  return (data as PlacesLibraryRow | null) ?? null;
}

export async function getLibraryEntryById(
  id: string,
): Promise<PlacesLibraryRow | null> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  const { data } = await supabase
    .from("places_library")
    .select("*")
    .eq("user_id", owner.id)
    .eq("id", id)
    .maybeSingle();

  return (data as PlacesLibraryRow | null) ?? null;
}

export async function listLibrary(filters: {
  place_type?: string;
  surface_priority?: string;
} = {}): Promise<PlacesLibraryRow[]> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  let query = supabase
    .from("places_library")
    .select("*")
    .eq("user_id", owner.id)
    .order("last_researched_at", { ascending: false })
    .limit(200);

  if (filters.place_type) {
    query = query.eq("place_type", filters.place_type);
  }

  const { data } = await query;
  return (data ?? []) as PlacesLibraryRow[];
}

export async function recordSurfaced(libraryId: string): Promise<void> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  const { data } = await supabase
    .from("places_library")
    .select("times_surfaced")
    .eq("id", libraryId)
    .eq("user_id", owner.id)
    .single();

  const current = (data as { times_surfaced: number } | null)?.times_surfaced ?? 0;

  await supabase
    .from("places_library")
    .update({
      times_surfaced: current + 1,
      last_surfaced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", libraryId)
    .eq("user_id", owner.id);
}

export async function recordUserFeedback(
  libraryId: string,
  signal: "saved" | "passed" | "completed",
): Promise<void> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  await supabase
    .from("places_library")
    .update({
      user_feedback_signal: signal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", libraryId)
    .eq("user_id", owner.id);
}
