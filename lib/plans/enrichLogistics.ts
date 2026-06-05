/**
 * enrichInfoStrip — page-layer logistics wiring for the plan hero strip.
 *
 * buildPlanBrief stays pure and truth-aware (honest fallbacks, no network).
 * This runs in the plan server component to upgrade the Weather and "In the
 * Area" blocks with real data when it's available. Every lookup is guarded —
 * if an API isn't configured or returns nothing, the honest fallback block
 * from buildPlanBrief is preserved.
 */

import "server-only";

import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { hasMapbox, geocode } from "@/lib/sources/mapbox";
import { getDailyForecast } from "@/lib/sources/openMeteo";
import {
  hasGooglePlaces,
  nearbyPlaces,
  type GooglePlace,
} from "@/lib/sources/googlePlaces";
import type { LoadedPlan } from "@/lib/plans/loadPlan";
import type { PlanBrief, PlanInfoBlock } from "@/lib/plans/planBrief";

export async function enrichInfoStrip(
  brief: PlanBrief,
  loaded: LoadedPlan,
): Promise<PlanInfoBlock[]> {
  const blocks = brief.infoStrip.map((b) => ({ ...b }));

  const [weather, parking, inArea] = await Promise.all([
    resolveWeather(brief, loaded).catch(() => null),
    resolveParking(brief, loaded).catch(() => null),
    resolveInArea(brief, loaded).catch(() => null),
  ]);

  if (weather) blocks[1] = weather;
  if (parking) blocks[2] = parking;
  if (inArea) blocks[3] = inArea;

  return blocks;
}

export async function resolveHeroImage(
  loaded: LoadedPlan,
): Promise<string | null> {
  const keyStats = isRecord(loaded.keyStats) ? loaded.keyStats : {};
  const cached =
    typeof keyStats.hero_image_url === "string"
      ? keyStats.hero_image_url
      : null;
  return cached && cached.startsWith("http") ? cached : null;
}

async function resolveParking(
  brief: PlanBrief,
  loaded: LoadedPlan,
): Promise<PlanInfoBlock | null> {
  if (!hasGooglePlaces()) return null;

  const coords = await venueCoords(loaded);
  if (!coords) return null;

  // Search for parking lots/garages within 400m of the venue.
  const places = await nearbyPlaces({
    lat: coords.lat,
    lng: coords.lng,
    radiusMeters: 400,
    includedTypes: ["parking"],
    maxResults: 3,
  }).catch(() => [] as GooglePlace[]);

  if (!places.length) return null;

  // Pick the closest / first result.
  const lot = places[0];
  const name = lot.displayName?.text ?? "Parking nearby";
  const distance = lot.shortFormattedAddress ?? "nearby";

  return {
    label: "PARKING",
    value: name,
    sub: distance,
    icon: "parking",
  };
}

async function resolveWeather(
  brief: PlanBrief,
  loaded: LoadedPlan,
): Promise<PlanInfoBlock | null> {
  if (!brief.scheduledDate) return null;
  // Only within the 7-day forecast window.
  const target = new Date(`${brief.scheduledDate}T12:00:00`);
  const daysOut = Math.floor((target.getTime() - Date.now()) / 86_400_000);
  if (daysOut < 0 || daysOut > 6) return null;

  const coords = await venueCoords(loaded);
  if (!coords) return null;

  const forecast = await getDailyForecast({ ...coords, days: 7 });
  const idx = forecast.dates.indexOf(brief.scheduledDate);
  if (idx === -1) return null;

  const high = Math.round(forecast.highF[idx]);
  return {
    label: "WEATHER",
    value: `${high}°`,
    sub: weatherWord(forecast.weatherCode[idx]),
    icon: "weather",
  };
}

async function resolveInArea(
  brief: PlanBrief,
  loaded: LoadedPlan,
): Promise<PlanInfoBlock | null> {
  const area = (brief.areaLabel ?? loaded.locationName ?? loaded.locationLine)
    ?.toLowerCase()
    .trim();
  if (!area) return null;

  const { id: userId } = await getViewableProfileId();
  if (!userId) return null;
  const supabase = await getServerSupabase();
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

async function venueCoords(
  loaded: LoadedPlan,
): Promise<{ lat: number; lng: number } | null> {
  if (!hasMapbox()) return null;
  const query = loaded.address ?? loaded.locationLine ?? loaded.locationName;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
