import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { qualityTierFromScore, type LibraryQualityTier } from "@/lib/library/quality";
import type { LibraryEntity, LibraryHealth } from "@/lib/library/types";
import type { Json } from "@/lib/types/database";

export type { LibraryEntity, LibraryHealth, LibraryQualityTier };

export type LibraryOperationalStatus = {
  lastAutopilotRun: {
    createdAt: string;
    operation: string;
    summary: string | null;
  } | null;
  lastBootstrapRun: {
    createdAt: string;
    summary: string | null;
  } | null;
  sourceStatuses: {
    testing: number;
    watching: number;
    cooldown: number;
    muted: number;
    retired: number;
  };
};

export async function readLibraryHealth(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<LibraryHealth> {
  const supabase = input.supabase ?? await getServerSupabase();
  const now = new Date().toISOString();
  const [
    placesRes,
    eventsRes,
    sourcesRes,
    tastemakersRes,
    candidateRes,
    refreshRes,
    rejectedRes,
  ] = await Promise.all([
    supabase.from("places_library").select("id,quality_tier,verdict_strength", { count: "exact" }).eq("user_id", input.userId),
    supabase.from("current_events").select("id,quality_tier,verdict_strength,status", { count: "exact" }).eq("user_id", input.userId).gte("starts_at", now),
    supabase.from("intelligence_sources").select("id,status", { count: "exact" }).eq("user_id", input.userId),
    supabase.from("tastemakers").select("id", { count: "exact" }).eq("user_id", input.userId),
    supabase.from("radar_candidate_inbox").select("id", { count: "exact" }).eq("user_id", input.userId).in("status", ["new", "evaluated"]),
    supabase.from("places_library").select("id", { count: "exact", head: true }).eq("user_id", input.userId).or(`next_refresh_at.lte.${now},last_refreshed_at.lt.${daysAgo(45)}`),
    supabase.from("radar_candidate_inbox").select("id", { count: "exact", head: true }).eq("user_id", input.userId).in("status", ["rejected", "duplicate", "stale"]),
  ]);
  const placeRows = (placesRes.data ?? []) as Array<{ quality_tier?: string | null; verdict_strength?: number | null }>;
  const eventRows = (eventsRes.data ?? []) as Array<{ quality_tier?: string | null; verdict_strength?: number | null; status?: string | null }>;
  const tierA = countTier([...placeRows, ...eventRows], "A");
  const tierB = countTier([...placeRows, ...eventRows], "B");
  const tierC = countTier([...placeRows, ...eventRows], "C");
  const places = placesRes.count ?? placeRows.length;
  const events = eventsRes.count ?? eventRows.length;
  const sources = sourcesRes.count ?? 0;
  const people = tastemakersRes.count ?? 0;
  return {
    places,
    events,
    sources,
    organizations: 0,
    people,
    recurringSignals: 0,
    pendingCandidates: candidateRes.count ?? 0,
    rejectedMuted: rejectedRes.count ?? 0,
    needsRefresh: refreshRes.count ?? 0,
    tierA,
    tierB,
    tierC,
    depthScore: libraryDepthScore({ places, events, sources, people, pending: candidateRes.count ?? 0 }),
  };
}

export async function listLibraryEntities(input: {
  userId: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<LibraryEntity[]> {
  const supabase = input.supabase ?? await getServerSupabase();
  const limit = input.limit ?? 40;
  const [placesRes, eventsRes, sourcesRes, tastemakersRes] = await Promise.all([
    supabase.from("places_library").select("*").eq("user_id", input.userId).order("updated_at", { ascending: false }).limit(limit),
    supabase.from("current_events").select("*").eq("user_id", input.userId).order("starts_at", { ascending: true }).limit(limit),
    supabase.from("intelligence_sources").select("*").eq("user_id", input.userId).order("updated_at", { ascending: false }).limit(limit),
    supabase.from("tastemakers").select("*").eq("user_id", input.userId).order("updated_at", { ascending: false }).limit(limit),
  ]);
  return [
    ...((placesRes.data ?? []) as Array<Record<string, unknown>>).map(placeEntity),
    ...((eventsRes.data ?? []) as Array<Record<string, unknown>>).map(eventEntity),
    ...((sourcesRes.data ?? []) as Array<Record<string, unknown>>).map(sourceEntity),
    ...((tastemakersRes.data ?? []) as Array<Record<string, unknown>>).map(tastemakerEntity),
  ];
}

export async function readLibraryOperationalStatus(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<LibraryOperationalStatus> {
  const supabase = input.supabase ?? await getServerSupabase();
  const [lastAutopilotRes, lastBootstrapRes, sourceStatusRes] = await Promise.all([
    supabase
      .from("intelligence_traces")
      .select("created_at,decision_type,outcome")
      .eq("user_id", input.userId)
      .eq("route", "lib/radar/autopilot.runRadarAutopilot")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("intelligence_traces")
      .select("created_at,outcome")
      .eq("user_id", input.userId)
      .eq("route", "lib/radar/autopilot.runRadarAutopilot")
      .eq("decision_type", "foundation_build_mode")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("intelligence_sources")
      .select("status")
      .eq("user_id", input.userId),
  ]);
  const sourceStatuses = {
    testing: 0,
    watching: 0,
    cooldown: 0,
    muted: 0,
    retired: 0,
  };
  for (const row of (sourceStatusRes.data ?? []) as Array<{ status?: string | null }>) {
    if (row.status && row.status in sourceStatuses) {
      sourceStatuses[row.status as keyof typeof sourceStatuses]++;
    }
  }
  const lastAutopilot = lastAutopilotRes.data as { created_at?: string; decision_type?: string; outcome?: string | null } | null;
  const lastBootstrap = lastBootstrapRes.data as { created_at?: string; outcome?: string | null } | null;
  return {
    lastAutopilotRun: lastAutopilot?.created_at && lastAutopilot.decision_type
      ? {
          createdAt: lastAutopilot.created_at,
          operation: lastAutopilot.decision_type,
          summary: lastAutopilot.outcome ?? null,
        }
      : null,
    lastBootstrapRun: lastBootstrap?.created_at
      ? {
          createdAt: lastBootstrap.created_at,
          summary: lastBootstrap.outcome ?? null,
        }
      : null,
    sourceStatuses,
  };
}

function placeEntity(row: Record<string, unknown>): LibraryEntity {
  const score = numberValue(row.quality_score) ?? numberValue(row.verdict_strength);
  return {
    id: String(row.id),
    type: "place",
    title: String(row.name ?? "Untitled place"),
    summary: stringValue(row.verdict),
    city: stringValue(row.neighborhood),
    tags: arrayValue(row.vibe_keywords),
    status: score != null && score < 0.35 ? "rejected" : "active",
    qualityTier: stringValue(row.quality_tier) as LibraryQualityTier | undefined ?? qualityTierFromScore(score),
    qualityScore: score ?? undefined,
    lastSeenAt: stringValue(row.last_refreshed_at),
    lastResearchedAt: stringValue(row.last_researched_at),
    nextRefreshAt: stringValue(row.next_refresh_at),
    sourceId: stringValue(row.source_id),
    metadata: row as Json,
  };
}

function eventEntity(row: Record<string, unknown>): LibraryEntity {
  const score = numberValue(row.quality_score) ?? numberValue(row.verdict_strength);
  const status = String(row.status ?? "pending");
  return {
    id: String(row.id),
    type: "event",
    title: String(row.title ?? "Untitled event"),
    summary: stringValue(row.verdict) ?? stringValue(row.description),
    city: stringValue(row.venue_name),
    tags: arrayValue(row.vibe_keywords),
    status: status === "rejected" ? "rejected" : status === "expired" ? "archived" : "active",
    qualityTier: stringValue(row.quality_tier) as LibraryQualityTier | undefined ?? qualityTierFromScore(score),
    qualityScore: score ?? undefined,
    lastSeenAt: stringValue(row.discovered_at),
    sourceId: stringValue(row.source_id),
    metadata: row as Json,
  };
}

function sourceEntity(row: Record<string, unknown>): LibraryEntity {
  const score = numberValue(row.trust_score);
  return {
    id: String(row.id),
    type: "source",
    title: stringValue(row.name) ?? stringValue(row.domain) ?? String(row.source_key),
    summary: stringValue(row.status),
    city: stringValue(row.city),
    tags: arrayValue(row.topics),
    status: row.status === "cooldown" ? "stale" : row.status === "muted" || row.status === "retired" ? "muted" : "watching",
    qualityTier: qualityTierFromScore(score),
    qualityScore: score ?? undefined,
    lastSeenAt: stringValue(row.last_checked_at),
    nextRefreshAt: stringValue(row.next_check_at),
    metadata: row as Json,
  };
}

function tastemakerEntity(row: Record<string, unknown>): LibraryEntity {
  return {
    id: String(row.id),
    type: "person",
    title: String(row.name ?? "Untitled tastemaker"),
    summary: stringValue(row.notes),
    tags: [stringValue(row.role)].filter((value): value is string => Boolean(value)),
    status: "watching",
    qualityTier: "B",
    qualityScore: 0.62,
    lastSeenAt: stringValue(row.last_checked_at),
    metadata: row as Json,
  };
}

function countTier(rows: Array<{ quality_tier?: string | null; verdict_strength?: number | null }>, tier: LibraryQualityTier): number {
  return rows.filter((row) => (row.quality_tier ?? qualityTierFromScore(row.verdict_strength)) === tier).length;
}

function libraryDepthScore(input: { places: number; events: number; sources: number; people: number; pending: number }): number {
  return Math.min(1, input.places / 75 * 0.35 + input.events / 30 * 0.2 + input.sources / 25 * 0.25 + input.people / 20 * 0.1 + input.pending / 60 * 0.1);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
