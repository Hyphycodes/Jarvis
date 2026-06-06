import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  hasGooglePlaces,
  searchPlaceForEnrichment,
  getPlacePhotoUrl,
  type GooglePlace,
} from "@/lib/sources/googlePlaces";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import type { SupabaseClient } from "@supabase/supabase-js";
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

/**
 * A row this strong is worth surfacing on its verdict alone when Google is
 * unreachable. Matches enrichPending's MIN_STRENGTH so the same rows that are
 * eligible for enrichment are eligible for verdict-only surfacing.
 */
const MIN_SURFACE_STRENGTH = 0.6;

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

/** The founder's city, trimmed to the primary token (e.g. "Chicago"). */
async function readHomeCity(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("home_city")
      .eq("id", userId)
      .maybeSingle();
    const raw = (data as { home_city?: string | null } | null)?.home_city;
    if (typeof raw !== "string" || !raw.trim()) return null;
    return raw.split(/[/,]/)[0]?.trim() || null;
  } catch {
    return null;
  }
}

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

  // Use the founder's real city (e.g. "Chicago") to disambiguate the lookup.
  // The old env default could be a suburb, which made Chicago venues miss.
  const homeCity = await readHomeCity(supabase, row.user_id);

  // ── Google Places: canonical location data ──────────────────────────────────
  if (!hasGooglePlaces()) {
    await supabase
      .from("places_library")
      .update({ enrichment_status: "skipped_no_google", last_researched_at: new Date().toISOString() })
      .eq("id", placeId);
    return { placeId, status: "skipped_no_google", filled: [] };
  }

  const needsLocation =
    isEmpty(row.address) ||
    row.lat == null ||
    row.lng == null ||
    isEmpty(row.hours_summary) ||
    isEmpty(row.image_url);

  let googleMatched = false;
  // Distinguish "Google returned no confident match" (place may be unverifiable)
  // from "Google was unreachable" (API disabled / network / quota). The latter
  // must NOT permanently dead-end a well-researched row.
  let googleUnavailable = false;
  if (needsLocation) {
    // Name + neighborhood + city is the most reliable disambiguating query
    // (text search; no coordinate bias that could pull to the wrong suburb).
    const queryParts = [row.name, row.neighborhood, homeCity].filter(Boolean);
    let match: GooglePlace | null = null;
    try {
      match = await searchPlaceForEnrichment({ query: queryParts.join(", ") });
    } catch (err) {
      googleUnavailable = true;
      const message = err instanceof Error ? err.message : String(err);
      // Surface the actionable cause loudly. The most common one in this app is
      // the Places API (New) being disabled in the Google Cloud project, which
      // returns 403 SERVICE_DISABLED — a one-time console toggle, not a code bug.
      const apiDisabled = /SERVICE_DISABLED|has not been used in project|disabled/i.test(message);
      console.error("[enrichPlace] Google Places unavailable", {
        placeId,
        name: row.name,
        apiDisabled,
        hint: apiDisabled
          ? "Enable 'Places API (New)' in Google Cloud Console, then re-run enrichment."
          : undefined,
        message: message.slice(0, 300),
      });
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
        const hours = condenseHours(match.currentOpeningHours?.weekdayDescriptions);
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
      // A real venue photo — Google Places photos are venue-accurate (no stock
      // mismatch risk), so use the first directly.
      if (isEmpty(row.image_url)) {
        const photoName = match.photos?.[0]?.name;
        if (photoName) {
          updates.image_url = getPlacePhotoUrl({ photoName, maxWidthPx: 1200 });
          filled.push("image_url");
        }
      }
    }
  }

  // ── Tavily: why-now / atmosphere fields Google Places doesn't carry ──────────
  const needsWhyNow = isEmpty(row.seasonal_notes);
  const needsVibe = (row.vibe_keywords?.length ?? 0) < 2;
  if (hasTavily() && (needsWhyNow || needsVibe)) {
    try {
      const where = row.neighborhood ?? homeCity ?? "Chicago";
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
  // Status priority:
  //  1. We filled at least one field → enriched.
  //  2. Google was UNREACHABLE (not "no match") and the row is strong enough to
  //     stand on its verdict alone → enriched, so the materializer can surface it
  //     now with what we have. The row keeps null coords/photo and still matches
  //     enrichPending's null-location selector, so it backfills automatically the
  //     moment Places API (New) is reachable again. This keeps Radar alive even
  //     when one external provider is down/disabled instead of starving every lane.
  //  3. Google was reachable but gave no confident match → no_place_match.
  //  4. Otherwise nothing to do.
  const strongEnough = (row.verdict_strength ?? 0) >= MIN_SURFACE_STRENGTH;
  const status: EnrichmentStatus =
    filled.length > 0 ? "enriched"
    : needsLocation && googleUnavailable && strongEnough ? "enriched"
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
