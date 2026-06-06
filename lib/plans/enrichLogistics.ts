/**
 * enrichInfoStrip / resolveHeroImage / resolveHeroNote — page-layer logistics
 * for the plan hero.
 *
 * buildPlanBrief stays pure and truth-aware (honest fallbacks, no network).
 * This runs in the plan server component to upgrade the four tiles + hero with
 * real data. It does NOT depend on Google Places / Mapbox being configured:
 *   - Weather is keyless openMeteo, targeted at the founder's home coords when
 *     the venue can't be geocoded.
 *   - Parking degrades to a clickable Google Maps "find parking" deep-link.
 *   - The hero photo comes from the venue's official site (og:image) + a
 *     city-biased web image search, ranked by source.
 * Every lookup is guarded — a miss preserves the honest fallback block.
 */

import "server-only";

import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { hasMapbox, geocode } from "@/lib/sources/mapbox";
import { getDailyForecast } from "@/lib/sources/openMeteo";
import { resolveItemImage } from "@/lib/sources/images";
import { parkingMapsUrl } from "@/lib/plans/venueLinks";
import {
  hasGooglePlaces,
  nearbyPlaces,
  type GooglePlace,
} from "@/lib/sources/googlePlaces";
import type { LoadedPlan } from "@/lib/plans/loadPlan";
import type { PlanBrief, PlanInfoBlock } from "@/lib/plans/planBrief";

type Coords = { lat: number; lng: number };

export async function enrichInfoStrip(
  brief: PlanBrief,
  loaded: LoadedPlan,
): Promise<PlanInfoBlock[]> {
  const blocks = brief.infoStrip.map((b) => ({ ...b }));

  const { id: userId } = await getViewableProfileId();
  const supabase = await getServerSupabase();
  const home = userId ? await homeCoords(userId, supabase) : null;

  const [weather, parking, inArea] = await Promise.all([
    resolveWeather(brief, loaded, home).catch(() => null),
    resolveParking(brief, loaded).catch(() => null),
    resolveInArea(brief, userId, supabase).catch(() => null),
  ]);

  if (weather) blocks[1] = weather;
  if (parking) blocks[2] = parking;
  if (inArea) blocks[3] = inArea;

  return blocks;
}

/**
 * Resolve an accurate hero photo without Google Places. Priority:
 *   1. cached key_stats.hero_image_url
 *   2. og:image from the venue's official site + a city-biased image search
 *      (resolveItemImage ranks by source) — then cache it
 *   3. null → the hero's atmospheric gradient
 */
export async function resolveHeroImage(
  loaded: LoadedPlan,
): Promise<string | null> {
  const keyStats = isRecord(loaded.keyStats) ? loaded.keyStats : {};
  const cached =
    typeof keyStats.hero_image_url === "string" ? keyStats.hero_image_url : null;
  if (cached && cached.startsWith("http")) return cached;

  const name = loaded.locationName ?? loaded.title;
  if (!name) return null;
  const resolved = await resolveItemImage({
    name,
    // Disambiguate the web search by place (e.g. "The Promontory Hyde Park /
    // Chicago" → the real Chicago venue, not a same-named golf club). Falls back
    // to the founder's home city so even plans built before venue facts resolve.
    city: loaded.neighborhood ?? (await homeCity()),
    category: loaded.planType,
    url: loaded.officialUrl ?? null,
  }).catch(() => null);

  if (!resolved?.url) return null;
  await cacheHeroImage(loaded, resolved.url, resolved.source === "og:image");
  return resolved.url;
}

/**
 * A short, truthful weather-aware arrival line for the hero (mirrors the
 * reference's "Rain clears by 7pm. Best arriving after sunset."). Returns
 * undefined when there's nothing real to say — the page keeps the plan summary.
 */
export async function resolveHeroNote(
  brief: PlanBrief,
  loaded: LoadedPlan,
): Promise<string | undefined> {
  const { id: userId } = await getViewableProfileId();
  const supabase = await getServerSupabase();
  const home = userId ? await homeCoords(userId, supabase) : null;
  const forecast = await targetForecast(brief, loaded, home).catch(() => null);
  if (!forecast) return undefined;

  const { high, code, precip } = forecast;
  if (precip >= 40 || (code >= 51 && code <= 82)) {
    return `Rain in the forecast — around ${high}°. Give yourself cover getting in.`;
  }
  if (code === 0 || code <= 2) {
    return `Clear skies, ${high}°. An easy night to be out.`;
  }
  return `${weatherWord(code)}, ${high}°. Comfortable for the evening.`;
}

async function resolveWeather(
  brief: PlanBrief,
  loaded: LoadedPlan,
  home: Coords | null,
): Promise<PlanInfoBlock | null> {
  const forecast = await targetForecast(brief, loaded, home);
  if (!forecast) return null;
  return {
    label: "WEATHER",
    value: `${forecast.high}°`,
    sub: weatherWord(forecast.code),
    icon: "weather",
  };
}

async function resolveParking(
  brief: PlanBrief,
  loaded: LoadedPlan,
): Promise<PlanInfoBlock | null> {
  // Real nearby lots when Google Places is configured.
  if (hasGooglePlaces()) {
    const coords = await venueCoords(loaded);
    if (coords) {
      const places = await nearbyPlaces({
        lat: coords.lat,
        lng: coords.lng,
        radiusMeters: 400,
        includedTypes: ["parking"],
        maxResults: 3,
      }).catch(() => [] as GooglePlace[]);
      if (places.length) {
        const lot = places[0];
        return {
          label: "PARKING",
          value: lot.displayName?.text ?? "Parking nearby",
          sub: lot.shortFormattedAddress ?? "nearby",
          icon: "parking",
        };
      }
    }
  }

  // Keyless fallback: the brain's parking note + a clickable maps deep-link.
  const venueQuery =
    brief.venueLinks?.address ??
    [brief.title, brief.neighborhood].filter(Boolean).join(", ");
  if (!venueQuery) return null;
  const note = brief.venueLinks?.parkingNote;
  return {
    label: "PARKING",
    value: note ? shortLabel(note, 18) : "Find parking",
    sub: "Tap for lots nearby",
    icon: "parking",
    href: parkingMapsUrl(venueQuery),
    external: true,
  };
}

async function resolveInArea(
  brief: PlanBrief,
  userId: string | null | undefined,
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
): Promise<PlanInfoBlock | null> {
  const area = (brief.neighborhood ?? brief.areaLabel ?? brief.locationLabel)
    ?.toLowerCase()
    .trim();
  if (!area || !userId) return null;

  const { data } = await supabase
    .from("circle_people")
    .select("name,neighborhood")
    .eq("user_id", userId)
    .not("neighborhood", "is", null);

  const people = (data ?? []) as Array<{
    name: string;
    neighborhood: string | null;
  }>;
  const match = people.find((p) => {
    const hood = p.neighborhood?.toLowerCase().trim();
    return hood && (area.includes(hood) || hood.includes(area));
  });
  if (!match) return null;

  return {
    label: "IN THE AREA",
    value: match.name,
    sub: match.neighborhood ?? undefined,
    icon: "person",
  };
}

// ── Shared resolution ─────────────────────────────────────────────────────────

type TargetForecast = { high: number; code: number; precip: number };

/** Forecast for the plan's target date, from venue coords or home coords. */
async function targetForecast(
  brief: PlanBrief,
  loaded: LoadedPlan,
  home: Coords | null,
): Promise<TargetForecast | null> {
  // Use the calendar date STRING (TZ-stable) rather than reconstructing through
  // a UTC Date, which can shift an evening time to the next day.
  const dateKey =
    brief.scheduledDate ??
    (brief.targetStart && /^\d{4}-\d{2}-\d{2}/.test(brief.targetStart)
      ? brief.targetStart.slice(0, 10)
      : toDateKey(new Date())); // default to tonight so the tile lights up
  if (!dateKey) return null;

  const coords = (await venueCoords(loaded)) ?? home;
  if (!coords) return null;

  const forecast = await getDailyForecast({ ...coords, days: 7 });
  const idx = forecast.dates.indexOf(dateKey);
  if (idx === -1) return null;

  return {
    high: Math.round(forecast.highF[idx]),
    code: forecast.weatherCode[idx],
    precip: forecast.precipitationProbability[idx] ?? 0,
  };
}

async function cacheHeroImage(
  loaded: LoadedPlan,
  url: string,
  fromOfficialSite: boolean,
): Promise<void> {
  try {
    const supabase = getSupabaseServiceClient();
    const keyStats = isRecord(loaded.keyStats) ? { ...loaded.keyStats } : {};
    keyStats.hero_image_url = url;
    await supabase
      .from("plans")
      .update({ key_stats: keyStats })
      .eq("id", loaded.id);
    // An og:image off the official site is high-confidence — also fix the Radar
    // card photo (which may be a name-matched mismatch).
    if (fromOfficialSite && loaded.sourceItemId) {
      await supabase
        .from("surfaced_items")
        .update({ image_url: url })
        .eq("id", loaded.sourceItemId);
    }
  } catch (error) {
    console.error("[plan.hero] cache", error);
  }
}

/** The founder's home city, trimmed to the primary token (e.g. "Chicago"). */
async function homeCity(): Promise<string | null> {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return null;
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from("profiles")
      .select("home_city")
      .eq("id", id)
      .maybeSingle();
    const raw = (data as { home_city?: string | null } | null)?.home_city;
    if (typeof raw !== "string" || !raw.trim()) return null;
    return raw.split(/[/,]/)[0]?.trim() || null;
  } catch {
    return null;
  }
}

async function homeCoords(
  userId: string,
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
): Promise<Coords | null> {
  const { data } = await supabase
    .from("profiles")
    .select("home_latitude, home_longitude")
    .eq("id", userId)
    .maybeSingle();
  const row = data as { home_latitude?: number | null; home_longitude?: number | null } | null;
  if (typeof row?.home_latitude === "number" && typeof row?.home_longitude === "number") {
    return { lat: row.home_latitude, lng: row.home_longitude };
  }
  return null;
}

async function venueCoords(loaded: LoadedPlan): Promise<Coords | null> {
  if (!hasMapbox()) return null;
  const query =
    loaded.mapsQuery ?? loaded.address ?? loaded.locationLine ?? loaded.locationName;
  if (!query) return null;
  const results = await geocode(query);
  const first = results[0];
  return first ? { lat: first.lat, lng: first.lng } : null;
}

function weatherWord(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Storms";
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shortLabel(value: string, max: number): string {
  const first = value.split(/[;,]/)[0]?.trim() ?? value.trim();
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
