import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { buildBrainContext } from "@/lib/brain/context";
import { hasSerpapi, searchGoogleEvents, type SerpGoogleEventResult } from "@/lib/sources/serpapi";
import { normalizeExternalId } from "@/lib/radar/engine/curation";
import {
  EVENTS_SUBLIBRARIES,
  EVENT_SUBLIBRARIES,
  classifyEventSubLibrary,
  type EventSubLibrary,
} from "@/lib/radar/engine/events/config";

/**
 * Structured event scout (per sub-library) via SerpAPI Google Events. This is the
 * RELIABLE sourcing layer that fixes the Tavily dry spell: SerpAPI returns real
 * events with date/venue/ticket/image already structured (no LLM extraction). The
 * existing Tavily+Claude `runEventScout` stays as a complementary source.
 *
 * Writes NEW candidates to current_events (status='pending'); the verifier then
 * confirms date/venue/source. Classifies each into its sub_library.
 */

export type EventScoutResult = {
  subLibrary: EventSubLibrary;
  proposed: number;
  added: number;
  skippedExisting: number;
};

// Two queries per sub-library — enough variety, bounded SerpAPI cost (cached).
const QUERIES: Record<EventSubLibrary, string[]> = {
  events_music: ["live jazz concert {city}", "concert {city} this week"],
  events_food: ["wine dinner {city}", "chef tasting dinner event {city}"],
  events_art: ["gallery opening {city}", "museum event {city}"],
  events_outdoor: ["outdoor festival {city}", "park event {city}"],
};

export async function scoutAllEventSubLibraries(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<EventScoutResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: EventScoutResult[] = [];
  if (!hasSerpapi()) return out;

  const brain = await buildBrainContext({ userId: input.userId, includeWeather: false, supabase });
  const city = brain.homeCity?.trim() || "Chicago";

  // Existing dedup keys (future events) so we never re-insert.
  const { data: existingRows } = await supabase
    .from("current_events")
    .select("venue_name, starts_at, external_id")
    .eq("user_id", input.userId)
    .gte("starts_at", new Date().toISOString());
  const existing = new Set<string>();
  for (const r of (existingRows ?? []) as Array<{ venue_name: string | null; starts_at: string | null; external_id: string | null }>) {
    if (r.external_id) existing.add(r.external_id);
    const k = dedupeKey(r.venue_name, r.starts_at);
    if (k) existing.add(k);
  }

  for (const subLibrary of EVENT_SUBLIBRARIES) {
    const result: EventScoutResult = { subLibrary, proposed: 0, added: 0, skippedExisting: 0 };
    const rows: Array<Record<string, unknown>> = [];
    const batchSeen = new Set<string>();

    for (const template of QUERIES[subLibrary]) {
      let events: SerpGoogleEventResult[] = [];
      try {
        events = await searchGoogleEvents({ query: template.replace("{city}", city), location: city, maxResults: 10 });
      } catch {
        continue; // best-effort
      }
      result.proposed += events.length;

      for (const ev of events) {
        const title = ev.title?.trim();
        const venue = ev.venue?.name?.trim() || (ev.address ?? [])[0]?.trim() || null;
        const startsAt = parseSerpDate(ev.date?.when ?? ev.date?.start_date ?? null);
        if (!title || !venue || !startsAt) continue;

        const ticket = (ev.ticket_info ?? []).find((t) => isHttpUrl(t.link))?.link ?? (isHttpUrl(ev.link) ? ev.link : null);
        const externalId = normalizeExternalId(`${title}-${venue}-${startsAt.slice(0, 10)}`);
        const dk = dedupeKey(venue, startsAt);
        if (existing.has(externalId) || (dk && existing.has(dk)) || batchSeen.has(externalId)) {
          result.skippedExisting += 1;
          continue;
        }
        batchSeen.add(externalId);

        // Classify (the query targets a sub-library, but the content decides).
        const sub = classifyEventSubLibrary({
          title,
          description: ev.description ?? null,
          venue_name: venue,
        });

        rows.push({
          user_id: input.userId,
          title,
          slug: slugify(`${title}-${venue}`),
          event_type: eventTypeFor(sub),
          sub_library: sub,
          venue_name: venue,
          venue_address: (ev.address ?? []).join(", ") || null,
          named_entities: [],
          starts_at: startsAt,
          ends_at: null,
          ticket_url: ticket,
          image_url: isHttpUrl(ev.thumbnail) ? ev.thumbnail : null,
          vibe_keywords: [EVENTS_SUBLIBRARIES[sub].label.toLowerCase()],
          description: ev.description ?? null,
          sources_cited: [{ source: "serpapi_events", link: ev.link ?? null, ticket }],
          discovered_via: ev.link ?? "serpapi_events",
          external_id: externalId,
          status: "pending",
        });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("current_events").insert(rows);
      if (!error) {
        result.added = rows.length;
        for (const r of rows) existing.add(String(r.external_id));
      }
    }
    out.push(result);
  }
  return out;
}

function eventTypeFor(sub: EventSubLibrary): string {
  switch (sub) {
    case "events_music":
      return "live_music";
    case "events_food":
      return "chef_dinner";
    case "events_art":
      return "art_opening";
    case "events_outdoor":
      return "other";
  }
}

/** Parse SerpAPI's loose date strings into ISO; roll to next year if already past. */
function parseSerpDate(raw: string | null): string | null {
  if (!raw || !/\d/.test(raw)) return null;
  // SerpAPI "when" often "Fri, Jun 12, 7 – 10 PM" — take the part before the range dash.
  const cleaned = raw.split(/[–-]\s*\d/)[0].trim();
  const now = Date.now();
  for (const candidate of [cleaned, `${cleaned} ${new Date().getFullYear()}`]) {
    const t = Date.parse(candidate);
    if (Number.isFinite(t)) {
      const rolled = t < now - 24 * 60 * 60 * 1000 ? t + 365 * 24 * 60 * 60 * 1000 : t;
      return new Date(rolled).toISOString();
    }
  }
  return null;
}

function dedupeKey(venue: string | null, startsAt: string | null): string | null {
  if (!venue || !startsAt) return null;
  return `${venue.toLowerCase().replace(/[^a-z0-9]/g, "")}:${startsAt.slice(0, 10)}`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function isHttpUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}
