import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { buildBrainContext } from "@/lib/brain/context";
import { scoreCategoryCouncil, type HoldReason } from "@/lib/brain/categoryCouncils";
import { writeEventVerdict } from "@/lib/brain/eventVerdict";
import { qualityTierFromScore } from "@/lib/library/quality";
import { upsertSourceFromLibraryEntity } from "@/lib/library/sourceGraph";
import { triggerPlanBuildsForNewRadarItems } from "@/lib/plans/autoBuild";
import { hasSerpapi, searchGoogleEvents } from "@/lib/sources/serpapi";
import { hasTavily, searchWeb } from "@/lib/sources/tavily";
import { hasTicketmaster, searchEvents } from "@/lib/sources/ticketmaster";
import { pillarsForItem } from "@/lib/radar/engine/pillars";
import { ENGINE_SOURCE } from "@/lib/radar/engine/ownership";
import type { IndexedItem } from "@/lib/index/types";
import type { CurrentEventRow, PlacesLibraryRow } from "@/lib/types/database";

const DEFAULT_LIMIT = 20;

// ── Why-now string for surfaced_items ─────────────────────────────────────────

function buildWhyNow(event: CurrentEventRow): string {
  const parts: string[] = [];
  if (event.named_entities.length > 0) {
    parts.push(event.named_entities.slice(0, 2).join(" + "));
  }
  if (event.starts_at) {
    const d = new Date(event.starts_at);
    if (!Number.isNaN(d.getTime())) {
      parts.push(
        `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
      );
    }
  }
  return parts.join(" · ") || "Upcoming event.";
}

type EventVerification = {
  ready: boolean;
  holdReasons: HoldReason[];
  startsAt: string | null;
  venueName: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  evidence: Record<string, unknown>;
};

function hasOfficialEventTime(value: string | null | undefined): value is string {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return !/T00:00(?::00(?:\.000)?)?(?:Z|[+-]\d\d:?\d\d)?$/i.test(value);
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function firstSourceUrl(event: CurrentEventRow): string | null {
  if (isHttpUrl(event.ticket_url)) return event.ticket_url;
  if (isHttpUrl(event.discovered_via)) return event.discovered_via;
  return firstUrlFromUnknown(event.sources_cited);
}

function firstUrlFromUnknown(value: unknown): string | null {
  if (isHttpUrl(value)) return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstUrlFromUnknown(entry);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      const found = firstUrlFromUnknown(entry);
      if (found) return found;
    }
  }
  return null;
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a).includes(norm(b)) || norm(b).includes(norm(a));
}

function parseSerpEventDate(value: unknown): string | null {
  if (typeof value !== "string" || !/\d/.test(value)) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  const iso = new Date(parsed).toISOString();
  return hasOfficialEventTime(iso) ? iso : null;
}

async function verifyEventForRadar(
  event: CurrentEventRow,
  libraryEntry: PlacesLibraryRow | null,
): Promise<EventVerification> {
  let startsAt: string | null = hasOfficialEventTime(event.starts_at) ? event.starts_at : null;
  let venueName: string | null = event.venue_name?.trim() || null;
  let sourceUrl: string | null = firstSourceUrl(event);
  let sourceName: string | null = sourceUrl ? "existing-source" : null;
  const evidence: Record<string, unknown> = {};

  if ((!startsAt || !sourceUrl || !venueName) && hasTicketmaster() && typeof libraryEntry?.lat === "number" && typeof libraryEntry?.lng === "number") {
    const start = new Date(event.starts_at);
    const windowStart = Number.isNaN(start.getTime())
      ? new Date()
      : new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const windowEnd = Number.isNaN(start.getTime())
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : new Date(start.getTime() + 48 * 60 * 60 * 1000);
    const matches = await searchEvents({
      lat: libraryEntry.lat,
      lng: libraryEntry.lng,
      radiusMiles: 25,
      keyword: event.title,
      startDateTime: windowStart.toISOString().replace(/\.\d{3}Z$/, "Z"),
      endDateTime: windowEnd.toISOString().replace(/\.\d{3}Z$/, "Z"),
      size: 5,
    }).catch(() => []);
    const match = matches.find((candidate) =>
      sameText(candidate.name, event.title) ||
      sameText(candidate._embedded?.venues?.[0]?.name, venueName),
    );
    if (match) {
      const venue = match._embedded?.venues?.[0];
      startsAt = match.dates?.start?.dateTime ?? startsAt;
      venueName = venue?.name ?? venueName;
      sourceUrl = match.url ?? sourceUrl;
      sourceName = "ticketmaster";
      evidence.ticketmaster = { id: match.id, name: match.name, venue: venue?.name };
    }
  }

  if ((!startsAt || !sourceUrl || !venueName) && hasSerpapi()) {
    const results = await searchGoogleEvents({
      query: `${event.title} ${venueName ?? ""}`.trim(),
      maxResults: 5,
    }).catch(() => []);
    const match = results.find((candidate) =>
      sameText(candidate.title, event.title) ||
      sameText(candidate.venue?.name, venueName),
    );
    if (match) {
      const ticket = match.ticket_info?.find((entry) => isHttpUrl(entry.link));
      startsAt = parseSerpEventDate(match.date?.start_date) ?? parseSerpEventDate(match.date?.when) ?? startsAt;
      venueName = match.venue?.name ?? venueName;
      sourceUrl = ticket?.link ?? match.link ?? sourceUrl;
      sourceName = ticket?.source ?? "google-events";
      evidence.google_events = { title: match.title, venue: match.venue?.name, source: sourceName };
    }
  }

  if (!sourceUrl && hasTavily()) {
    const result = await searchWeb({
      query: `${event.title} ${venueName ?? ""} tickets official event`,
      maxResults: 3,
    }).catch(() => null);
    const match = result?.results.find((candidate) => isHttpUrl(candidate.url));
    if (match) {
      sourceUrl = match.url;
      sourceName = "tavily";
      evidence.tavily = { title: match.title, url: match.url };
    }
  }

  const holdReasons: HoldReason[] = [];
  if (!hasOfficialEventTime(startsAt)) holdReasons.push("missing_date");
  if (!venueName) holdReasons.push("missing_location");
  if (!sourceUrl) holdReasons.push("missing_source");

  return {
    ready: holdReasons.length === 0,
    holdReasons,
    startsAt,
    venueName,
    sourceUrl,
    sourceName,
    evidence,
  };
}

function eventIndexedItem(input: {
  event: CurrentEventRow;
  startsAt: string;
  venueName: string;
  sourceUrl: string;
  score: number;
  whyNow: string;
  verdict: string;
}): IndexedItem {
  const now = new Date().toISOString();
  return {
    id: input.event.id,
    source: "events",
    sourceId: input.event.id,
    type: "event",
    category: "events",
    title: input.event.title,
    subtitle: input.venueName,
    description: input.verdict,
    locationName: input.venueName,
    startsAt: input.startsAt,
    endsAt: input.event.ends_at ?? undefined,
    url: input.sourceUrl,
    rawPayload: {
      event_id: input.event.id,
      event_type: input.event.event_type,
      named_entities: input.event.named_entities,
      venue_name: input.venueName,
      verdict_strength: input.score,
      why_now: input.whyNow,
    },
    status: "shown",
    destination: "radar",
    score: input.score,
    reasons: [input.whyNow, input.verdict],
    tags: input.event.vibe_keywords ?? [],
    createdAt: input.event.created_at ?? now,
    updatedAt: now,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function processEventCandidates(
  userId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ surfaced: number; held: number; rejected: number; errors: string[] }> {
  const supabase = getSupabaseServiceClient();

  let surfaced = 0;
  let held = 0;
  let rejected = 0;
  const errors: string[] = [];

  const context = await buildBrainContext({ userId, includeWeather: false, supabase });

  // Fetch pending events, soonest first, hard-capped
  const { data: candidates, error: fetchError } = await supabase
    .from("current_events")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(Math.min(limit, DEFAULT_LIMIT));

  if (fetchError) {
    const msg = `Failed to fetch current_events: ${fetchError.message}`;
    console.error("[eventWorker]", msg);
    return { surfaced, held, rejected, errors: [msg] };
  }

  const rows = (candidates ?? []) as CurrentEventRow[];
  console.warn(`[eventWorker] Processing ${rows.length} event candidates`);

  for (const event of rows) {
    try {
      // Fetch linked library entry if available
      let libraryEntry: PlacesLibraryRow | null = null;
      if (event.library_place_id) {
        const { data: lib } = await supabase
          .from("places_library")
          .select("*")
          .eq("id", event.library_place_id)
          .maybeSingle();
        libraryEntry = (lib as PlacesLibraryRow | null) ?? null;
      }

      const verdict = await writeEventVerdict(event, libraryEntry, context);
      const now = new Date().toISOString();

      if (verdict.recommended_action === "reject") {
        await supabase
          .from("current_events")
          .update({
            status: "rejected",
            verdict: verdict.verdict,
            verdict_strength: verdict.verdict_strength,
            quality_score: verdict.verdict_strength,
            quality_tier: "rejected",
            updated_at: now,
          })
          .eq("id", event.id);
        rejected++;
        continue;
      }

      const verification = await verifyEventForRadar(event, libraryEntry);
      if (!verification.ready) {
        await supabase
          .from("current_events")
          .update({
            status: "needs_enrichment",
            verdict: verdict.verdict,
            verdict_strength: verdict.verdict_strength,
            quality_score: verdict.verdict_strength,
            quality_tier: qualityTierFromScore(verdict.verdict_strength),
            sources_cited: {
              original: event.sources_cited ?? null,
              verification: verification.evidence,
              hold_reasons: verification.holdReasons,
            },
            updated_at: now,
          })
          .eq("id", event.id);
        held++;
        continue;
      }
      const verifiedStartsAt = verification.startsAt;
      const verifiedVenueName = verification.venueName;
      const verifiedSourceUrl = verification.sourceUrl;
      if (!verifiedStartsAt || !verifiedVenueName || !verifiedSourceUrl) {
        held++;
        continue;
      }

      const newStatus = verdict.recommended_action === "surface_radar" ? "surfaced" : "verified";
      const sourceId = await upsertSourceFromLibraryEntity({
        userId,
        title: verifiedVenueName,
        url: verifiedSourceUrl,
        sourceKey: verifiedSourceUrl,
        entityType: "event",
        qualityScore: verdict.verdict_strength,
        topics: event.vibe_keywords,
        supabase,
      });

      // Update the event row
      await supabase
        .from("current_events")
        .update({
          status: newStatus,
          verdict: verdict.verdict,
          verdict_strength: verdict.verdict_strength,
          quality_score: verdict.verdict_strength,
          quality_tier: qualityTierFromScore(verdict.verdict_strength),
          source_id: sourceId,
          starts_at: verifiedStartsAt,
          venue_name: verifiedVenueName,
          ticket_url: verifiedSourceUrl,
          sources_cited: {
            original: event.sources_cited ?? null,
            verification: verification.evidence,
            verified_source: verification.sourceName,
          },
          updated_at: now,
        })
        .eq("id", event.id);

      // Create a surfaced_items row for Radar if verdict is strong enough
      if (verdict.recommended_action === "surface_radar") {
        const verifiedEvent = {
          ...event,
          starts_at: verifiedStartsAt,
          venue_name: verifiedVenueName,
          ticket_url: verifiedSourceUrl,
        } as CurrentEventRow;
        const whyNow = buildWhyNow(verifiedEvent);
        const categoryCouncil = scoreCategoryCouncil(eventIndexedItem({
          event,
          startsAt: verifiedStartsAt,
          venueName: verifiedVenueName,
          sourceUrl: verifiedSourceUrl,
          score: verdict.verdict_strength,
          whyNow,
          verdict: verdict.verdict,
        }), "events");
        const { error: surfaceError } = await supabase
          .from("surfaced_items")
          .insert({
            user_id: userId,
            destination: "radar",
            source: "event_pulse",
            source_id: event.id,
            title: event.title,
            subtitle: verifiedVenueName,
            description: verdict.verdict,
            location_name: verifiedVenueName,
            starts_at: verifiedStartsAt,
            ends_at: event.ends_at ?? null,
            url: verifiedSourceUrl,
            type: "event",
            category: "events",
            tags: event.vibe_keywords ?? [],
            reasons: [whyNow, verdict.verdict],
            score: verdict.verdict_strength,
            source_label: categoryCouncil.sourceLabel ?? null,
            status: "shown",
            payload: {
              // Engine-owned: the Events lane is curated by the events engine
              // (lib/radar/engine/events.ts), so loadSurface trusts the stored
              // category and the old promote pipeline leaves it alone.
              source_layer: ENGINE_SOURCE,
              event_id: event.id,
              event_type: event.event_type,
              named_entities: event.named_entities,
              venue_name: verifiedVenueName,
              library_place_id: event.library_place_id,
              verdict_strength: verdict.verdict_strength,
              why_now: whyNow,
              source_label: categoryCouncil.sourceLabel ?? null,
              category_council: {
                category: categoryCouncil.category,
                score: categoryCouncil.score,
                signals: categoryCouncil.signals,
                flags: categoryCouncil.flags,
              },
              pillar_tags: pillarsForItem({
                category: "events",
                lane: "events",
                tags: event.vibe_keywords ?? [],
                title: event.title,
              }),
              verified_source_url: verifiedSourceUrl,
              official_starts_at: verifiedStartsAt,
              event_time_locked: true,
            },
          });

        if (surfaceError) {
          console.warn("[eventWorker] surfaced_items insert failed", {
            event: event.title,
            error: surfaceError.message,
          });
        } else {
          surfaced++;
          void triggerPlanBuildsForNewRadarItems(userId).catch((error) => {
            console.error("[eventWorker] radar plan auto-build failed", {
              eventId: event.id,
              error,
            });
          });
        }
      } else {
        held++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Unknown error for "${event.title}"`;
      console.error("[eventWorker] event failed", { id: event.id, title: event.title, err });
      errors.push(`${event.title}: ${msg}`);
    }
  }

  console.warn("[eventWorker] Done", { surfaced, held, rejected, errors: errors.length });
  return { surfaced, held, rejected, errors };
}
