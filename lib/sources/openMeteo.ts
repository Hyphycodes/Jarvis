import { fetchJson } from "@/lib/http";
import { cached, TTL } from "@/lib/cache";

/**
 * Open-Meteo — no key required. Imperial units, timezone derived from coordinates.
 * https://open-meteo.com/en/docs
 */

const BASE = "https://api.open-meteo.com/v1/forecast";

export type CurrentWeather = {
  temperatureF: number;
  windMph: number;
  weatherCode: number;
  time: string;
};

export type HourlyForecast = {
  times: string[];
  temperatureF: number[];
  precipitationProbability: number[];
  weatherCode: number[];
};

export type DailyForecast = {
  dates: string[];
  highF: number[];
  lowF: number[];
  precipitationProbability: number[];
  weatherCode: number[];
};

const DEFAULTS = {
  temperature_unit: "fahrenheit",
  wind_speed_unit: "mph",
  timezone: "auto",
} as const;

export async function getCurrentWeather(input: {
  lat: number;
  lng: number;
}): Promise<CurrentWeather> {
  const key = `openmeteo:current:${input.lat.toFixed(3)},${input.lng.toFixed(3)}`;
  return cached(key, TTL.weather, async () => {
    const raw = await fetchJson<{
      current: {
        time: string;
        temperature_2m: number;
        wind_speed_10m: number;
        weather_code: number;
      };
    }>(BASE, {
      service: "open-meteo",
      query: {
        latitude: input.lat,
        longitude: input.lng,
        current: "temperature_2m,wind_speed_10m,weather_code",
        ...DEFAULTS,
      },
    });
    return {
      temperatureF: raw.current.temperature_2m,
      windMph: raw.current.wind_speed_10m,
      weatherCode: raw.current.weather_code,
      time: raw.current.time,
    };
  });
}

export async function getHourlyForecast(input: {
  lat: number;
  lng: number;
  hours?: number;
}): Promise<HourlyForecast> {
  const hours = input.hours ?? 24;
  const key = `openmeteo:hourly:${input.lat.toFixed(3)},${input.lng.toFixed(3)}:${hours}`;
  return cached(key, TTL.weather, async () => {
    const raw = await fetchJson<{
      hourly: {
        time: string[];
        temperature_2m: number[];
        precipitation_probability: number[];
        weather_code: number[];
      };
    }>(BASE, {
      service: "open-meteo",
      query: {
        latitude: input.lat,
        longitude: input.lng,
        hourly:
          "temperature_2m,precipitation_probability,weather_code",
        forecast_days: 2,
        ...DEFAULTS,
      },
    });
    return {
      times: raw.hourly.time.slice(0, hours),
      temperatureF: raw.hourly.temperature_2m.slice(0, hours),
      precipitationProbability: raw.hourly.precipitation_probability.slice(0, hours),
      weatherCode: raw.hourly.weather_code.slice(0, hours),
    };
  });
}

export async function getDailyForecast(input: {
  lat: number;
  lng: number;
  days?: number;
}): Promise<DailyForecast> {
  const days = Math.min(input.days ?? 7, 16);
  const key = `openmeteo:daily:${input.lat.toFixed(3)},${input.lng.toFixed(3)}:${days}`;
  return cached(key, TTL.weather, async () => {
    const raw = await fetchJson<{
      daily: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
        weather_code: number[];
      };
    }>(BASE, {
      service: "open-meteo",
      query: {
        latitude: input.lat,
        longitude: input.lng,
        daily:
          "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
        forecast_days: days,
        ...DEFAULTS,
      },
    });
    return {
      dates: raw.daily.time,
      highF: raw.daily.temperature_2m_max,
      lowF: raw.daily.temperature_2m_min,
      precipitationProbability: raw.daily.precipitation_probability_max,
      weatherCode: raw.daily.weather_code,
    };
  });
}
