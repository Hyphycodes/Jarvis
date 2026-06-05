import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { qualityTierFromScore } from "@/lib/library/quality";
import { upsertSourceFromLibraryEntity } from "@/lib/library/sourceGraph";
import { assessResultQuality } from "@/lib/sources/resultQuality";
import { resolveItemImage, isHttpUrl } from "@/lib/sources/images";
import type { RunBudget } from "@/lib/radar/foundationSprint";
import type { Json, RadarCandidateInboxRow } from "@/lib/types/database";

export type CandidateConversionResult = {
  reviewed: number;
  placesCreated: number;
  placesUpdated: number;
  eventsCreated: number;
  eventsUpdated: number;
  sourcesCreated: number;
  rejected: number;
  duplicates: number;
  needsEnrichment: number;
  errors: string[];
  timeBudgetReached: boolean;
};

export async function convertCandidateInboxToLibrary(input: {
  userId: string;
  supabase: SupabaseClient;
  limit?: number;
  budget?: RunBudget;
}): Promise<CandidateConversionResult> {
  const result: CandidateConversionResult = {
    reviewed: 0,
    placesCreated: 0,
    placesUpdated: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    sourcesCreated: 0,
    rejected: 0,
    duplicates: 0,
    needsEnrichment: 0,
    errors: [],
    timeBudgetReached: false,
  };
  const limit = input.limit ?? 30;
  const { data: founder } = await input.supabase
    .from("founder_profile")
    .select("avoid_keywords,dealbreakers")
    .eq("user_id", input.userId)
    .maybeSingle();
  const avoid = [
    ...arrayValue((founder as { avoid_keywords?: unknown } | null)?.avoid_keywords),
    ...arrayValue((founder as { dealbreakers?: unknown } | null)?.dealbreakers),
  ];
  const { data, error } = await input.supabase
    .from("radar_candidate_inbox")
    .select("*")
    .eq("user_id", input.userId)
    .in("status", ["new", "evaluated"])
    .order("score", { ascending: false, nullsFirst: false })
    .order("discovered_at", { ascending: true })
    .limit(limit);
  if (error) {
    result.errors.push(`candidate inbox read failed: ${error.message}`);
    return result;
  }

  for (const row of (data ?? []) as RadarCandidateInboxRow[]) {
    if (input.budget?.shouldStopSoon()) {
      result.timeBudgetReached = true;
      result.errors.push("Time budget reached during Candidate Inbox conversion. Partial progress saved.");
      break;
    }
    result.reviewed++;
    try {
      const penalty = negativeFilter(row, avoid);
      if (penalty) {
        await markCandidate(input.supabase, input.userId, row.id, {
          status: "rejected",
          rejection_reason: penalty,
          reason: { summary: penalty, source: "foundation_sprint" },
        });
        result.rejected++;
        continue;
      }
      const quality = assessResultQuality({
        title: row.title,
        snippet: row.description,
        url: row.url,
        category: row.entity_type,
        type: row.entity_type,
      });
      if (quality.hardReject) {
        const reason = `Rejected by discovery quality filter: ${quality.reasons.join(" ") || quality.flags.join(", ")}.`;
        await markCandidate(input.supabase, input.userId, row.id, {
          status: "rejected",
          rejection_reason: reason,
          reason: {
            summary: reason,
            quality_flags: quality.flags,
            source: "foundation_sprint_quality_filter",
          },
        });
        result.rejected++;
        continue;
      }
      const entityType = classifyCandidate(row);
      // Enrich the inbox row with a real photo so promoted items already carry it.
      if ((entityType === "place" || entityType === "event") && !isHttpUrl(row.image_url)) {
        const resolved = await resolveItemImage({
          name: row.title,
          city: readNeighborhood(row),
          category: entityType === "place" ? "places" : "events",
          url: row.url,
          existingImageUrl: stringValue(readRaw(row, ["image_url"])) ?? stringValue(readRaw(row, ["images", "0", "url"])),
        });
        if (resolved) {
          await input.supabase
            .from("radar_candidate_inbox")
            .update({ image_url: resolved.url, updated_at: new Date().toISOString() })
            .eq("id", row.id)
            .eq("user_id", input.userId);
          row.image_url = resolved.url;
        }
      }
      if (entityType === "place") {
        const conversion = await convertPlace(input.supabase, input.userId, row);
        result.placesCreated += conversion.created ? 1 : 0;
        result.placesUpdated += conversion.updated ? 1 : 0;
        result.duplicates += conversion.duplicate ? 1 : 0;
        result.sourcesCreated += conversion.sourceCreated ? 1 : 0;
        continue;
      }
      if (entityType === "event") {
        const conversion = await convertEvent(input.supabase, input.userId, row);
        result.eventsCreated += conversion.created ? 1 : 0;
        result.eventsUpdated += conversion.updated ? 1 : 0;
        result.duplicates += conversion.duplicate ? 1 : 0;
        result.sourcesCreated += conversion.sourceCreated ? 1 : 0;
        result.needsEnrichment += conversion.needsEnrichment ? 1 : 0;
        continue;
      }
      if (entityType === "source") {
        const sourceId = await upsertSourceFromLibraryEntity({
          userId: input.userId,
          title: row.title,
          url: row.url,
          entityType: "source",
          qualityScore: normalizedScore(row),
          topics: tags(row),
          supabase: input.supabase,
        });
        await markCandidate(input.supabase, input.userId, row.id, {
          status: sourceId ? "library" : "evaluated",
          reason: {
            summary: sourceId ? "Converted into Source Graph." : "Source candidate needs enrichment.",
            source_id: sourceId,
          },
        });
        if (sourceId) result.sourcesCreated++;
        else result.needsEnrichment++;
        continue;
      }
      await markCandidate(input.supabase, input.userId, row.id, {
        status: "evaluated",
        reason: { summary: "Candidate reviewed; kept for context/enrichment, not surfaced." },
      });
      result.needsEnrichment++;
    } catch (err) {
      result.errors.push(`${row.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}

async function convertPlace(
  supabase: SupabaseClient,
  userId: string,
  row: RadarCandidateInboxRow,
): Promise<{ created: boolean; updated: boolean; duplicate: boolean; sourceCreated: boolean }> {
  const now = new Date().toISOString();
  const placeSlug = slug(row.title);
  const { data: existing } = await supabase
    .from("places_library")
    .select("id")
    .eq("user_id", userId)
    .eq("slug", placeSlug)
    .maybeSingle();
  const score = normalizedScore(row);
  const sourceId = await upsertSourceFromLibraryEntity({
    userId,
    title: row.title,
    url: row.url,
    entityType: "place",
    qualityScore: score,
    topics: tags(row),
    supabase,
  });
  const { data: upserted, error } = await supabase
    .from("places_library")
    .upsert({
      user_id: userId,
      name: row.title,
      slug: placeSlug,
      place_type: "restaurant",
      neighborhood: readNeighborhood(row),
      address: stringValue(readRaw(row, ["formattedAddress"])) ?? stringValue(readRaw(row, ["address"])) ?? null,
      cuisine_or_focus: readCuisine(row),
      vibe_keywords: tags(row),
      sources_cited: [{
        source: "candidate_inbox_conversion",
        candidate_id: row.id,
        url: row.url,
        converted_at: now,
      }] as Json,
      verdict: [
        row.description,
        "Converted from Candidate Inbox for Library enrichment; not automatically surfaced to Radar.",
      ].filter(Boolean).join(" "),
      verdict_strength: score,
      quality_score: score,
      quality_tier: qualityTierFromScore(score),
      image_url: typeof row.image_url === "string" && row.image_url.startsWith("http")
        ? row.image_url
        : null,
      best_for: tags(row).slice(0, 4),
      not_for: [],
      events_observed: [{
        candidate_id: row.id,
        raw_payload: row.raw_payload,
        needs_enrichment: true,
      }] as Json,
      source_id: sourceId,
      last_researched_at: now,
      last_refreshed_at: now,
      next_refresh_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now,
    }, { onConflict: "user_id,slug" })
    .select("id")
    .single();
  if (error) throw new Error(`places_library upsert failed: ${error.message}`);
  await markCandidate(supabase, userId, row.id, {
    status: "library",
    reason: {
      summary: "Converted to Places Library for enrichment. Active Radar remains gated.",
      library_id: (upserted as { id?: string } | null)?.id ?? null,
      quality_score: score,
    },
  });
  return {
    created: !(existing as { id?: string } | null)?.id,
    updated: Boolean((existing as { id?: string } | null)?.id),
    duplicate: false,
    sourceCreated: Boolean(sourceId),
  };
}

async function convertEvent(
  supabase: SupabaseClient,
  userId: string,
  row: RadarCandidateInboxRow,
): Promise<{ created: boolean; updated: boolean; duplicate: boolean; sourceCreated: boolean; needsEnrichment: boolean }> {
  const startsAt = readStartsAt(row);
  if (!startsAt) {
    await markCandidate(supabase, userId, row.id, {
      status: "evaluated",
      reason: {
        summary: "Event-like candidate needs enrichment; no exact starts_at was available, so no fake event date was created.",
        needs_enrichment: true,
      },
    });
    return { created: false, updated: false, duplicate: false, sourceCreated: false, needsEnrichment: true };
  }
  const now = new Date().toISOString();
  const venue = stringValue(readRaw(row, ["_embedded", "venues", "0", "name"])) ??
    stringValue(readRaw(row, ["venueName"])) ??
    row.description?.slice(0, 80) ??
    "Needs venue enrichment";
  const { data: existing } = await supabase
    .from("current_events")
    .select("id")
    .eq("user_id", userId)
    .eq("title", row.title)
    .eq("starts_at", startsAt)
    .maybeSingle();
  if ((existing as { id?: string } | null)?.id) {
    await markCandidate(supabase, userId, row.id, {
      status: "duplicate",
      rejection_reason: "Duplicate event already exists in Event Pulse.",
    });
    return { created: false, updated: false, duplicate: true, sourceCreated: false, needsEnrichment: false };
  }
  const score = normalizedScore(row);
  const sourceId = await upsertSourceFromLibraryEntity({
    userId,
    title: venue,
    url: row.url,
    entityType: "event",
    qualityScore: score,
    topics: tags(row),
    supabase,
  });
  const { data: inserted, error } = await supabase
    .from("current_events")
    .insert({
      user_id: userId,
      title: row.title,
      slug: slug(row.title),
      event_type: "other",
      venue_name: venue,
      named_entities: [],
      starts_at: startsAt,
      ends_at: stringValue(readRaw(row, ["dates", "end", "dateTime"])) ?? null,
      ticket_url: row.url,
      vibe_keywords: tags(row),
      description: row.description,
      sources_cited: [{
        source: "candidate_inbox_conversion",
        candidate_id: row.id,
        converted_at: now,
      }] as Json,
      verdict: "Converted from Candidate Inbox into Event Pulse for later verdicting; not automatically surfaced.",
      verdict_strength: score,
      quality_score: score,
      quality_tier: qualityTierFromScore(score),
      source_id: sourceId,
      discovered_via: row.url ?? "candidate_inbox",
      status: "pending",
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(`current_events insert failed: ${error.message}`);
  await markCandidate(supabase, userId, row.id, {
    status: "library",
    reason: {
      summary: "Converted to Event Pulse for verification. Active Radar remains gated.",
      event_id: (inserted as { id?: string } | null)?.id ?? null,
      quality_score: score,
    },
  });
  return { created: true, updated: false, duplicate: false, sourceCreated: Boolean(sourceId), needsEnrichment: false };
}

async function markCandidate(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  patch: {
    status: string;
    reason?: Json | null;
    rejection_reason?: string | null;
  },
) {
  await supabase
    .from("radar_candidate_inbox")
    .update({
      ...patch,
      evaluated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);
}

function classifyCandidate(row: RadarCandidateInboxRow): "place" | "event" | "source" | "other" {
  if (row.entity_type === "place" || row.entity_type === "event" || row.entity_type === "source") return row.entity_type;
  const text = [row.title, row.description, ...tags(row)].join(" ").toLowerCase();
  if (/event|concert|game|show|festival|ticket|tonight|weekend/.test(text)) return "event";
  if (/restaurant|bar|cafe|place|park|gym|lounge|venue|dining|food/.test(text)) return "place";
  if (/source|newsletter|publication|calendar|blog|instagram/.test(text)) return "source";
  return "other";
}

function negativeFilter(row: RadarCandidateInboxRow, avoid: string[]): string | null {
  const text = [row.title, row.description, ...tags(row)].join(" ").toLowerCase();
  const hit = avoid.find((entry) => {
    const value = entry.trim().toLowerCase();
    return value.length > 1 && text.includes(value);
  });
  return hit ? `Rejected by imported/founder negative filter: ${hit}.` : null;
}

function normalizedScore(row: RadarCandidateInboxRow): number {
  if (typeof row.score === "number") return clamp01(row.score);
  const tagsValue = tags(row);
  if (tagsValue.includes("needs_enrichment")) return 0.52;
  if (row.entity_type === "place" || row.entity_type === "event") return 0.62;
  return 0.55;
}

function tags(row: RadarCandidateInboxRow): string[] {
  const reasonTags = isRecord(row.reason) && Array.isArray(row.reason.tags) ? row.reason.tags : [];
  const rawTags = readRaw(row, ["tags"]);
  const payloadTags = readRaw(row, ["payload", "tags"]);
  return unique([
    ...arrayValue(rawTags),
    ...arrayValue(payloadTags),
    ...arrayValue(reasonTags),
    row.entity_type,
  ]);
}

function readStartsAt(row: RadarCandidateInboxRow): string | null {
  const startsAt =
    stringValue(readRaw(row, ["startsAt"])) ??
    stringValue(readRaw(row, ["starts_at"])) ??
    stringValue(readRaw(row, ["payload", "dates", "start", "dateTime"])) ??
    dateWithTime(
      stringValue(readRaw(row, ["payload", "dates", "start", "localDate"])),
      stringValue(readRaw(row, ["payload", "dates", "start", "localTime"])),
    );
  if (!startsAt) return null;
  const date = new Date(startsAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readNeighborhood(row: RadarCandidateInboxRow): string | null {
  return stringValue(readRaw(row, ["neighborhood"])) ??
    stringValue(readRaw(row, ["payload", "shortFormattedAddress"])) ??
    stringValue(readRaw(row, ["payload", "formattedAddress"])) ??
    null;
}

function readCuisine(row: RadarCandidateInboxRow): string | null {
  const tagList = tags(row).join(" ").toLowerCase();
  if (/mexican/.test(tagList)) return "Mexican";
  if (/japanese/.test(tagList)) return "Japanese";
  if (/mediterranean|middle eastern|greek/.test(tagList)) return "Mediterranean";
  if (/steak|restaurant|dining|food/.test(tagList)) return "Dining";
  return null;
}

function readRaw(row: RadarCandidateInboxRow, path: string[]): unknown {
  let current: unknown = row.raw_payload;
  for (const part of path) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function dateWithTime(date: string | null, time: string | null): string | null {
  if (!date || !time) return null;
  return `${date}T${time}`;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
