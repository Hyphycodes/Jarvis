import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { buildBrainContext } from "@/lib/brain/context";
import {
  hasSerpapi,
  searchGoogleEventsWithDiagnostics,
  type SerpGoogleEventResult,
  type SerpEventsDiagnostics,
} from "@/lib/sources/serpapi";
import { EVENTS_SUBLIBRARIES, parseSerpEventCandidate } from "@/lib/radar/engine/events/config";

/**
 * Structured event scout via SerpAPI Google Events. The reliable, no-LLM sourcing
 * layer (date/venue/ticket/image already structured).
 *
 * Principle: ingest BROAD reliable inventory first; let classification + the
 * verifier + readiness decide what's worth showing. SerpAPI is NOT responsible
 * for taste. So we run obvious high-recall city/category queries (Google Events
 * responds to plain search intent), classify each result into a sub-library AFTER
 * the fetch, and fall back to the regular Google onebox when google_events is dry.
 *
 * Every run captures full response-shape diagnostics (status / error / keys /
 * counts) and persists them so an empty lane can always explain WHY (no source,
 * vs. parsed-out, vs. all-duplicate) instead of failing silently.
 */

// Broad, boring, high-recall queries. `{city}` is substituted at run time.
const CITY_QUERIES = [
  "Events in {city}",
  "{city} events this weekend",
  "Things to do in {city} this weekend",
];
const CATEGORY_QUERIES = [
  "{city} concerts",
  "{city} live music",
  "{city} art events",
  "{city} food festivals",
  "{city} markets",
  "{city} comedy shows",
  "{city} museum events",
  "{city} theater",
];
// Wide discovery window by default; the app ranks/filters after.
const DATE_CHIP = "date:month";
const PER_QUERY_MAX = 12;
const OG_ENRICH_CAP = 8; // bounded Open-Graph image fetches per run

export type EventScoutRun = {
  proposed: number; // raw events returned across all queries
  parsed: number; // passed title + venue + real date
  added: number; // inserted as NEW pending candidates
  skippedExisting: number;
  rejected: Record<string, number>; // reason → count
  imagePresent: number; // inserted rows that carry an image
  usedFallback: boolean; // regular-google onebox fallback was needed
  noSource: boolean; // SerpAPI returned nothing usable across every query
  queries: SerpEventsDiagnostics[];
};

export async function scoutAllEventSubLibraries(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<EventScoutRun> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const run: EventScoutRun = {
    proposed: 0,
    parsed: 0,
    added: 0,
    skippedExisting: 0,
    rejected: {},
    imagePresent: 0,
    usedFallback: false,
    noSource: false,
    queries: [],
  };
  if (!hasSerpapi()) {
    run.noSource = true;
    run.rejected.no_serpapi_key = 1;
    await persistDiagnostics(supabase, input.userId, run, "no_serpapi_key");
    return run;
  }

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

  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];

  // Pass 1 — Google Events on broad city + category queries. No `location` param:
  // the city lives in the query and gl=us scopes it; an unrecognized `location`
  // string is a known way to get an empty/errored response, so we avoid it.
  const allQueries = [...CITY_QUERIES, ...CATEGORY_QUERIES].map((t) => t.replace(/\{city\}/g, city));
  for (const q of allQueries) {
    const { events, diagnostics } = await searchGoogleEventsWithDiagnostics({
      query: q,
      engine: "google_events",
      gl: "us",
      hl: "en",
      htichips: DATE_CHIP,
      maxResults: PER_QUERY_MAX,
    });
    run.queries.push(diagnostics);
    run.proposed += diagnostics.eventsCount;
    collectCandidates(input.userId, events, existing, seen, rows, run);
  }

  // Pass 2 — fallback to the regular Google onebox (also carries events_results)
  // ONLY when Google Events produced zero raw results across every query.
  if (run.proposed === 0) {
    run.usedFallback = true;
    for (const q of CITY_QUERIES.map((t) => t.replace(/\{city\}/g, city))) {
      const { events, diagnostics } = await searchGoogleEventsWithDiagnostics({
        query: q,
        engine: "google",
        gl: "us",
        hl: "en",
        maxResults: PER_QUERY_MAX,
      });
      run.queries.push(diagnostics);
      run.proposed += diagnostics.eventsCount;
      collectCandidates(input.userId, events, existing, seen, rows, run);
    }
  }

  run.noSource = run.proposed === 0;

  // Best-effort Open-Graph image enrichment for parsed events missing a thumbnail
  // (bounded). The readiness contract still hides anything that ends up imageless.
  let ogFetches = 0;
  for (const row of rows) {
    if (row.image_url || ogFetches >= OG_ENRICH_CAP) continue;
    const src = typeof row.discovered_via === "string" ? row.discovered_via : null;
    if (!src || !/^https?:\/\//i.test(src)) continue;
    ogFetches += 1;
    const og = await fetchOgImage(src);
    if (og) row.image_url = og;
  }
  run.imagePresent = rows.filter((r) => typeof r.image_url === "string" && r.image_url).length;

  if (rows.length > 0) {
    const { error } = await supabase.from("current_events").insert(rows);
    if (error) {
      run.rejected.insert_error = (run.rejected.insert_error ?? 0) + rows.length;
    } else {
      run.added = rows.length;
    }
  }

  await persistDiagnostics(supabase, input.userId, run, primaryFailureReason(run));
  return run;
}

/** Parse + classify + dedup a batch of SerpAPI events into insertable rows. */
function collectCandidates(
  userId: string,
  events: SerpGoogleEventResult[],
  existing: Set<string>,
  seen: Set<string>,
  rows: Array<Record<string, unknown>>,
  run: EventScoutRun,
): void {
  for (const ev of events) {
    const parsed = parseSerpEventCandidate(ev);
    if (!parsed.ok) {
      bump(run.rejected, parsed.reason);
      continue;
    }
    run.parsed += 1;
    const c = parsed.candidate;

    const dk = dedupeKey(c.venue, c.startsAt);
    if (existing.has(c.externalId) || (dk && existing.has(dk)) || seen.has(c.externalId)) {
      run.skippedExisting += 1;
      continue;
    }
    seen.add(c.externalId);

    rows.push({
      user_id: userId,
      title: c.title,
      slug: slugify(`${c.title}-${c.venue}`),
      event_type: c.eventType,
      sub_library: c.subLibrary,
      venue_name: c.venue,
      venue_address: (ev.address ?? []).join(", ") || null,
      named_entities: [],
      starts_at: c.startsAt,
      ends_at: null,
      ticket_url: c.ticketUrl,
      image_url: c.imageUrl,
      vibe_keywords: [EVENTS_SUBLIBRARIES[c.subLibrary].label.toLowerCase()],
      description: c.description,
      sources_cited: [{ source: "serpapi_events", link: c.link, ticket: c.ticketUrl }],
      discovered_via: c.link ?? "serpapi_events",
      external_id: c.externalId,
      status: "pending",
    });
  }
}

function primaryFailureReason(run: EventScoutRun): string {
  if (run.added > 0) return "ok";
  if (run.noSource) return "no_source";
  if (run.parsed === 0 && run.proposed > 0) return "all_parsed_out";
  if (run.parsed > 0 && run.skippedExisting >= run.parsed) return "all_duplicates";
  return "unknown";
}

/** Persist a readable run summary so an empty lane can always explain itself. */
async function persistDiagnostics(
  supabase: SupabaseClient,
  userId: string,
  run: EventScoutRun,
  primaryReason: string,
): Promise<void> {
  try {
    await supabase.from("intelligence_traces").insert({
      user_id: userId,
      route: "api/radar/engine",
      surface: "events",
      decision_type: "scout_diagnostics",
      context_summary: {
        primary_reason: primaryReason,
        proposed: run.proposed,
        parsed: run.parsed,
        added: run.added,
        skipped_existing: run.skippedExisting,
        image_present: run.imagePresent,
        used_fallback: run.usedFallback,
        no_source: run.noSource,
      },
      reasoning: {
        rejected: run.rejected,
        queries: run.queries,
      },
    });
  } catch {
    // diagnostics are best-effort; never let them break the scout
  }
}

/** Fetch a page's og:image (best-effort, short timeout, capped HTML read). */
export async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const found = m?.[1];
    return found && /^https?:\/\//i.test(found) ? found : null;
  } catch {
    return null;
  }
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function dedupeKey(venue: string | null, startsAt: string | null): string | null {
  if (!venue || !startsAt) return null;
  return `${venue.toLowerCase().replace(/[^a-z0-9]/g, "")}:${startsAt.slice(0, 10)}`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
