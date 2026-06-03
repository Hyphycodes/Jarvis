import "server-only";

import { getDefaultLocation } from "@/lib/env";
import { getCurrentWeather } from "@/lib/sources/openMeteo";
import type { TodayContext } from "@/lib/chat/context/types";

export async function getTodayContext(
  profile: { home_city?: string | null; timezone?: string | null },
  options: { includeWeather?: boolean } = {},
): Promise<TodayContext> {
  const timezone = profile.timezone ?? "America/Chicago";
  const now = new Date();
  const home = safeHome();

  let weather: TodayContext["weather"] = null;
  if (options.includeWeather) {
    try {
      const w = await getCurrentWeather({ lat: home.lat, lng: home.lng });
      weather = {
        temperatureF: w.temperatureF,
        windMph: w.windMph,
        weatherCode: w.weatherCode,
      };
    } catch {
      weather = null;
    }
  }

  return {
    isoDate: now.toISOString(),
    localDateLabel: new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeZone: timezone,
    }).format(now),
    timezone,
    homeCity: profile.home_city ?? home.city ?? null,
    weather,
  };
}

function safeHome() {
  try {
    return getDefaultLocation();
  } catch {
    return { lat: 41.85, lng: -87.65, city: "Chicago" };
  }
}
