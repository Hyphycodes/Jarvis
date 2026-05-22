import { ApiError, fetchJson } from "@/lib/http";
import { cached, TTL } from "@/lib/cache";
import { hasEnv } from "@/lib/env";

/**
 * Mapbox: geocoding + directions for distance, drive time, and leave-time
 * calculations. Walk/drive/bike profiles supported.
 */

const GEOCODE_BASE =
  "https://api.mapbox.com/geocoding/v5/mapbox.places";
const DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox";

export type DirectionsProfile = "driving" | "walking" | "cycling" | "driving-traffic";

export type GeocodeResult = {
  placeName: string;
  lat: number;
  lng: number;
  context?: string[];
};

export type DirectionsSummary = {
  distanceMeters: number;
  distanceMiles: number;
  durationSeconds: number;
  durationMinutes: number;
  profile: DirectionsProfile;
};

function token(): string {
  const t = process.env.MAPBOX_ACCESS_TOKEN;
  if (!t) throw new ApiError("MAPBOX_ACCESS_TOKEN not set", "mapbox", 0);
  return t;
}

export function hasMapbox(): boolean {
  return hasEnv("MAPBOX_ACCESS_TOKEN");
}

export async function geocode(query: string): Promise<GeocodeResult[]> {
  const key = `mapbox:geocode:${query}`;
  return cached(key, TTL.routeGeocode, async () => {
    const data = await fetchJson<{
      features: {
        place_name: string;
        center: [number, number];
        context?: { text?: string }[];
      }[];
    }>(`${GEOCODE_BASE}/${encodeURIComponent(query)}.json`, {
      service: "mapbox",
      query: { access_token: token(), limit: 5 },
    });
    return (data.features ?? []).map((f) => ({
      placeName: f.place_name,
      lng: f.center[0],
      lat: f.center[1],
      context: f.context?.map((c) => c.text ?? "").filter(Boolean),
    }));
  });
}

export async function reverseGeocode(input: {
  lat: number;
  lng: number;
}): Promise<GeocodeResult[]> {
  const key = `mapbox:reverse:${input.lat.toFixed(3)},${input.lng.toFixed(3)}`;
  return cached(key, TTL.routeGeocode, async () => {
    const data = await fetchJson<{
      features: {
        place_name: string;
        center: [number, number];
        context?: { text?: string }[];
      }[];
    }>(`${GEOCODE_BASE}/${input.lng},${input.lat}.json`, {
      service: "mapbox",
      query: { access_token: token(), limit: 3 },
    });
    return (data.features ?? []).map((f) => ({
      placeName: f.place_name,
      lng: f.center[0],
      lat: f.center[1],
      context: f.context?.map((c) => c.text ?? "").filter(Boolean),
    }));
  });
}

export async function getDirections(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  profile?: DirectionsProfile;
}): Promise<DirectionsSummary> {
  const profile = input.profile ?? "driving";
  const key = `mapbox:dir:${profile}:${input.fromLat.toFixed(3)},${input.fromLng.toFixed(3)}->${input.toLat.toFixed(3)},${input.toLng.toFixed(3)}`;
  return cached(key, TTL.routeGeocode, async () => {
    const data = await fetchJson<{
      routes?: { distance: number; duration: number }[];
    }>(
      `${DIRECTIONS_BASE}/${profile}/${input.fromLng},${input.fromLat};${input.toLng},${input.toLat}`,
      {
        service: "mapbox",
        query: { access_token: token(), overview: "false", alternatives: false },
      },
    );
    const route = data.routes?.[0];
    if (!route) throw new ApiError("mapbox: no route", "mapbox", 404);
    return {
      distanceMeters: route.distance,
      distanceMiles: route.distance / 1609.344,
      durationSeconds: route.duration,
      durationMinutes: route.duration / 60,
      profile,
    };
  });
}

export async function getRouteSummary(input: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}): Promise<{ driving: DirectionsSummary; walking?: DirectionsSummary }> {
  const driving = await getDirections({ ...input, profile: "driving-traffic" });
  let walking: DirectionsSummary | undefined;
  try {
    if (driving.distanceMiles <= 1.5) {
      walking = await getDirections({ ...input, profile: "walking" });
    }
  } catch {
    // Walking is best-effort.
  }
  return { driving, walking };
}
