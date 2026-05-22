import { ApiError, fetchJson } from "@/lib/http";
import { cached, TTL } from "@/lib/cache";
import { hasEnv } from "@/lib/env";

/**
 * Ticketmaster Discovery API — events, by lat/lng + radius.
 * https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */

const BASE = "https://app.ticketmaster.com/discovery/v2";

export type TicketmasterEvent = {
  id: string;
  name: string;
  url?: string;
  info?: string;
  description?: string;
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string };
    end?: { dateTime?: string; localDate?: string };
    timezone?: string;
  };
  images?: { url: string; ratio?: string; width?: number; height?: number }[];
  classifications?: {
    segment?: { name?: string };
    genre?: { name?: string };
    subGenre?: { name?: string };
  }[];
  _embedded?: {
    venues?: {
      name?: string;
      address?: { line1?: string; line2?: string };
      city?: { name?: string };
      state?: { stateCode?: string; name?: string };
      postalCode?: string;
      location?: { latitude?: string; longitude?: string };
    }[];
  };
};

function key(): string {
  const k = process.env.TICKETMASTER_API_KEY;
  if (!k) throw new ApiError("TICKETMASTER_API_KEY not set", "ticketmaster", 0);
  return k;
}

export function hasTicketmaster(): boolean {
  return hasEnv("TICKETMASTER_API_KEY");
}

export async function searchEvents(input: {
  lat: number;
  lng: number;
  radiusMiles?: number;
  startDateTime?: string;
  endDateTime?: string;
  keyword?: string;
  classificationName?: string;
  size?: number;
}): Promise<TicketmasterEvent[]> {
  const cacheKey = `tm:search:${input.lat.toFixed(2)},${input.lng.toFixed(2)}:${input.radiusMiles ?? 20}:${input.keyword ?? ""}:${input.classificationName ?? ""}:${input.startDateTime ?? ""}:${input.endDateTime ?? ""}`;
  return cached(cacheKey, TTL.events, async () => {
    const data = await fetchJson<{
      _embedded?: { events?: TicketmasterEvent[] };
    }>(`${BASE}/events.json`, {
      service: "ticketmaster",
      query: {
        apikey: key(),
        latlong: `${input.lat},${input.lng}`,
        radius: input.radiusMiles ?? 20,
        unit: "miles",
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        keyword: input.keyword,
        classificationName: input.classificationName,
        size: Math.min(input.size ?? 20, 50),
        sort: "date,asc",
      },
    });
    return data._embedded?.events ?? [];
  });
}

export async function getEventDetails(eventId: string): Promise<TicketmasterEvent> {
  const cacheKey = `tm:event:${eventId}`;
  return cached(cacheKey, TTL.events, async () =>
    fetchJson<TicketmasterEvent>(`${BASE}/events/${eventId}.json`, {
      service: "ticketmaster",
      query: { apikey: key() },
    }),
  );
}
