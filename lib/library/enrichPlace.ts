import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  hasGooglePlaces,
  searchPlaceForEnrichment,
  type GooglePlace,
} from "@/lib/sources/googlePlaces";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import { getDefaultLocation } from "@/lib/env";
import type { PlacesLibraryRow } from "@/lib/types/database";

export type EnrichmentStatus =
  | "enriched"
  | "no_place_match"
  | "nothing_to_fill"
  | "not_found"
  | "skipped_no_google";

export type EnrichPlaceResult = {
  placeId: string;
  status: EnrichmentStatus;
  filled: string[];
};

// Vibe adjectives we'll accept *only when they appear verbatim* in real web
// coverage — keeps derived keywords factual rather than invented.
const VIBE_LEXICON = [
  "intimate", "romantic", "lively", "cozy", "refined", "elegant", "rustic",
  "minimalist", "buzzy", "upscale", "casual", "moody", "atmospheric",
  "candlelit", "sleek", "charming", "vibrant", "relaxed", "energetic",
  "sophisticated", "trendy", "hidden", "classic", "modern", "warm", "airy",
  "dim", "bustling", "quiet", "seasonal", "riverside", "waterfront",
  "rooftop", "patio", "garden", "industrial", "lush", "nautical",
];

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function priceLevelToText(level: string | undefined): string | null {
  switch (level) {
    case "PRICE_LEVEL_INEXPENSIVE": return "$";
    case "PRICE_LEVEL_MODERATE": return "$$";
    case "PRICE_LEVEL_EXPENSIVE": return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE": return "$$$$";
    default: return null;
  }
}

function condenseHours(descriptions: string[] | undefined): string | null {
  if (!descriptions || descriptions.length === 0) return null;
  const joined = descriptions.map((d) => d.trim()).filter(Boolean).join("; ");
  if (!joined) return null;
  return joined.length > 400 ? `${joined.slice(0, 397)}…` : joined;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Conservative match: exact, substring, or a shared significant token. */
function nameMatches(stored: string, candidate: string | undefined): boolean {
  if (!candidate) return false;
  const a = normalizeName(stored);
  const b = normalizeName(candidate);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(" ").filter((t) => t.length >= 3));
  const bTokens = b.split(" ").filter((t) => t.length >= 3);
  return bTokens.some((t) => aTokens.has(t));
}

function deriveVibeKeywords(text: string, existing: string[], max = 4): string[] {
  const haystack = text.toLowerCase();
  const have = new Set(existing.map((k) => k.toLowerCase()));
  const found: string[] = [];
  for (const word of VIBE_LEXICON) {
    if (found.length >= max) break;
    if (have.has(word)) continue;
    // word-boundary match so "warm" doesn't fire on "warmth" mid-token, etc.
    if (new RegExp(`\\b${word}\\b`).test(haystack)) found.push(word);
  }
  return found;
}

function firstSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^.{20,220}?[.!?](\s|$)/);
  return (match ? match[0] : cleaned.slice(0, 220)).trim();
}

/**
 * Fill the location/hours/why-now fields that block a strong Library place from
 * becoming plan-complete. Idempotent: only fills currently-empty fields, never
 * overwrites a non-empty address/hours. Google Places is the source of truth
 * for address/lat/lng/hours; Tavily supplies the why-now line and vibe words.
 */
export async function enrichPlace(placeId: string): Promise<EnrichPlaceResult> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("places_library")
    .select("*")
    .eq("id", placeId)
    .maybeSingle();

  if (error || !data) {
    return { placeId, status: "not_found", filled: [] };
  }

  const row = data as PlacesLibraryRow;
  const updates: Record<string, unknown> = {};
  const filled: string[] = [];

  const home = (() => {
    try { return getDefaultLocation(); }
    catch { return null; }
  })();

  // ── Google Places: canonical location data ──────────────────────────────────
  if (!hasGooglePlaces()) {
    await supabase
      .from("places_library")
      .update({ enrichment_status: "skipped_no_google", last_researched_at: new Date().toISOString() })
      .eq("id", placeId);
    return { placeId, status: "skipped_no_google", filled: [] };
  }

  const needsLocation = isEmpty(row.address) || row.lat == null || row.lng == null || isEmpty(row.hours_summary);

  let googleMatched = false;
  if (needsLocation) {
    const queryParts = [row.name, row.neighborhood ?? home?.city ?? "Chicago"].filter(Boolean);
    let match: GooglePlace | null = null;
    try {
      match = await searchPlaceForEnrichment({
        query: queryParts.join(" "),
        lat: home?.lat,
        lng: home?.lng,
      });
    } catch (err) {
      console.warn("[enrichPlace] Google Places failed", { placeId, name: row.name, err });
    }

    if (match && nameMatches(row.name, match.displayName?.text)) {
      googleMatched = true;
      if (isEmpty(row.address) && match.formattedAddress) {
        updates.address = match.formattedAddress;
        filled.push("address");
      }
      if (row.lat == null && match.location?.latitude != null) {
        updates.lat = match.location.latitude;
        filled.push("lat");
      }
      if (row.lng == null && match.location?.longitude != null) {
        updates.lng = match.location.longitude;
        filled.push("lng");
      }
      if (isEmpty(row.hours_summary)) {
        const hours = condenseHours(match.regularOpeningHours?.weekdayDescriptions);
        if (hours) {
          updates.hours_summary = hours;
          filled.push("hours_summary");
        }
      }
      if (isEmpty(row.price_level)) {
        const price = priceLevelToText(match.priceLevel);
        if (price) {
          updates.price_level = price;
          filled.push("price_level");
        }
      }
    }
  }

  // ── Tavily: why-now / atmosphere fields Google Places doesn't carry ──────────
  const needsWhyNow = isEmpty(row.seasonal_notes);
  const needsVibe = (row.vibe_keywords?.length ?? 0) < 2;
  if (hasTavily() && (needsWhyNow || needsVibe)) {
    try {
      const where = row.neighborhood ?? home?.city ?? "Chicago";
      const res = await searchWeb({
        query: `"${row.name}" ${where} restaurant atmosphere recent`,
        maxResults: 5,
      });
      const corpus = [res.answer ?? "", ...res.results.map((r) => `${r.title} ${r.content}`)].join(" ");

      if (needsWhyNow) {
        const why = res.answer?.trim() || (res.results[0]?.content ? firstSentence(res.results[0].content) : "");
        if (why) {
          updates.seasonal_notes = why.length > 320 ? `${why.slice(0, 317)}…` : why;
          filled.push("seasonal_notes");
        }
      }
      if (needsVibe) {
        const derived = deriveVibeKeywords(corpus, row.vibe_keywords ?? []);
        if (derived.length > 0) {
          updates.vibe_keywords = [...(row.vibe_keywords ?? []), ...derived];
          filled.push("vibe_keywords");
        }
      }
    } catch (err) {
      console.warn("[enrichPlace] Tavily failed", { placeId, name: row.name, err });
    }
  }

  // ── Write back ───────────────────────────────────────────────────────────────
  // If we needed location but Google gave no confident match, record that rather
  // than guessing — location fields stay null.
  const status: EnrichmentStatus =
    filled.length > 0 ? "enriched"
    : needsLocation && !googleMatched ? "no_place_match"
    : "nothing_to_fill";

  updates.enrichment_status = status;
  updates.last_researched_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("places_library")
    .update(updates)
    .eq("id", placeId);

  if (updateError) {
    console.error("[enrichPlace] update failed", { placeId, updateError });
  }

  return { placeId, status, filled };
}
