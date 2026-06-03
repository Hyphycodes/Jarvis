import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type {
  CurrentEventRow,
  IntelligenceSourceRow,
  Json,
  PlacesLibraryRow,
  RadarCandidateInboxRow,
  SurfacedItemRow,
} from "@/lib/types/database";
import { readItemIntent } from "@/lib/items/intents";

export type LibraryPreviewCandidate = {
  id: string;
  title: string;
  entityType: string;
  status: string;
  score: number | null;
  source: string | null;
  campaign: string | null;
  discoveredAt: string;
  reason: string | null;
  rejectionReason: string | null;
  url: string | null;
};

export type LibraryPreviewSource = {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  url: string | null;
  domain: string | null;
  trustScore: number;
  tasteFitScore: number;
  noveltyScore: number;
  freshnessScore: number;
  totalCandidates: number;
  totalLibraryItems: number;
  saveRate: number;
  passRate: number;
  planRate: number;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  reason: string | null;
};

export type LibraryPreviewEntity = {
  id: string;
  title: string;
  type: "place" | "event";
  status: string;
  tier: string | null;
  score: number | null;
  sourceId: string | null;
  when: string | null;
  summary: string | null;
  tags: string[];
  url: string | null;
  updatedAt: string;
};

export type LibraryPreviewRejected = {
  id: string;
  title: string;
  type: string;
  source: string | null;
  status: string;
  reason: string | null;
  rejectedAt: string;
};

export type LibraryPreviewIntentItem = {
  id: string;
  title: string;
  status: string;
  destination: string;
  intent: string;
  reason: string | null;
  updatedAt: string;
};

export type LibraryPreview = {
  candidates: LibraryPreviewCandidate[];
  sources: LibraryPreviewSource[];
  places: LibraryPreviewEntity[];
  events: LibraryPreviewEntity[];
  rejectedMuted: LibraryPreviewRejected[];
  tiers: {
    A: LibraryPreviewEntity[];
    B: LibraryPreviewEntity[];
    C: LibraryPreviewEntity[];
  };
  intentItems: LibraryPreviewIntentItem[];
};

export async function readLibraryPreview(input: {
  userId: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<LibraryPreview> {
  const supabase = input.supabase ?? await getServerSupabase();
  const limit = input.limit ?? 25;
  const now = new Date().toISOString();
  const [
    candidateRes,
    sourceRes,
    placeRes,
    eventRes,
    rejectedCandidateRes,
    mutedSourceRes,
    intentRes,
  ] = await Promise.all([
    supabase
      .from("radar_candidate_inbox")
      .select("*")
      .eq("user_id", input.userId)
      .order("discovered_at", { ascending: false })
      .limit(limit),
    supabase
      .from("intelligence_sources")
      .select("*")
      .eq("user_id", input.userId)
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("places_library")
      .select("*")
      .eq("user_id", input.userId)
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("current_events")
      .select("*")
      .eq("user_id", input.userId)
      .gte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(limit),
    supabase
      .from("radar_candidate_inbox")
      .select("*")
      .eq("user_id", input.userId)
      .in("status", ["rejected", "duplicate", "stale"])
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("intelligence_sources")
      .select("*")
      .eq("user_id", input.userId)
      .in("status", ["cooldown", "muted", "retired"])
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", input.userId)
      .in("planning_state", ["saved_reference", "interested_later", "watching", "better_version", "muted"])
      .order("updated_at", { ascending: false })
      .limit(limit),
  ]);

  const places = ((placeRes.data ?? []) as PlacesLibraryRow[]).map(placePreviewEntity);
  const events = ((eventRes.data ?? []) as CurrentEventRow[]).map(eventPreviewEntity);
  const allEntities = [...places, ...events];
  return {
    candidates: ((candidateRes.data ?? []) as RadarCandidateInboxRow[]).map(candidatePreview),
    sources: ((sourceRes.data ?? []) as IntelligenceSourceRow[]).map(sourcePreview),
    places,
    events,
    rejectedMuted: [
      ...((rejectedCandidateRes.data ?? []) as RadarCandidateInboxRow[]).map(rejectedCandidatePreview),
      ...((mutedSourceRes.data ?? []) as IntelligenceSourceRow[]).map(rejectedSourcePreview),
    ].slice(0, limit),
    tiers: {
      A: allEntities.filter((entity) => entity.tier === "A").slice(0, limit),
      B: allEntities.filter((entity) => entity.tier === "B").slice(0, limit),
      C: allEntities.filter((entity) => entity.tier === "C").slice(0, limit),
    },
    intentItems: ((intentRes.data ?? []) as SurfacedItemRow[]).map(intentPreview),
  };
}

export function candidatePreview(row: RadarCandidateInboxRow): LibraryPreviewCandidate {
  return {
    id: row.id,
    title: row.title,
    entityType: row.entity_type,
    status: row.status,
    score: row.score,
    source: sourceLabel(row.raw_payload) ?? row.source_id,
    campaign: row.campaign_id,
    discoveredAt: row.discovered_at,
    reason: reasonSummary(row.reason),
    rejectionReason: row.rejection_reason,
    url: row.url,
  };
}

function sourcePreview(row: IntelligenceSourceRow): LibraryPreviewSource {
  return {
    id: row.id,
    title: row.name ?? row.domain ?? row.source_key,
    sourceType: row.source_type,
    status: row.status,
    url: row.url,
    domain: row.domain,
    trustScore: row.trust_score,
    tasteFitScore: row.taste_fit_score,
    noveltyScore: row.novelty_score,
    freshnessScore: row.freshness_score,
    totalCandidates: row.total_candidates,
    totalLibraryItems: row.total_library_items,
    saveRate: row.save_rate,
    passRate: row.pass_rate,
    planRate: row.plan_rate,
    lastCheckedAt: row.last_checked_at,
    nextCheckAt: row.next_check_at,
    reason: reasonSummary(row.metadata),
  };
}

function placePreviewEntity(row: PlacesLibraryRow): LibraryPreviewEntity {
  return {
    id: row.id,
    title: row.name,
    type: "place",
    status: row.quality_tier === "rejected" ? "rejected" : "active",
    tier: row.quality_tier ?? null,
    score: row.quality_score ?? row.verdict_strength ?? null,
    sourceId: row.source_id ?? null,
    when: row.last_refreshed_at ?? row.last_researched_at ?? row.updated_at,
    summary: row.verdict,
    tags: row.vibe_keywords ?? [],
    url: null,
    updatedAt: row.updated_at,
  };
}

function eventPreviewEntity(row: CurrentEventRow): LibraryPreviewEntity {
  return {
    id: row.id,
    title: row.title,
    type: "event",
    status: row.status,
    tier: row.quality_tier ?? null,
    score: row.quality_score ?? row.verdict_strength ?? null,
    sourceId: row.source_id ?? null,
    when: row.starts_at,
    summary: row.verdict ?? row.description,
    tags: row.vibe_keywords ?? [],
    url: row.ticket_url,
    updatedAt: row.updated_at,
  };
}

function rejectedCandidatePreview(row: RadarCandidateInboxRow): LibraryPreviewRejected {
  return {
    id: row.id,
    title: row.title,
    type: row.entity_type,
    source: sourceLabel(row.raw_payload) ?? row.source_id,
    status: row.status,
    reason: row.rejection_reason ?? reasonSummary(row.reason) ?? "Rejected, duplicate, or stale during evaluation.",
    rejectedAt: row.evaluated_at ?? row.updated_at,
  };
}

function rejectedSourcePreview(row: IntelligenceSourceRow): LibraryPreviewRejected {
  return {
    id: row.id,
    title: row.name ?? row.domain ?? row.source_key,
    type: row.source_type,
    source: row.domain ?? row.url,
    status: row.status,
    reason: reasonSummary(row.metadata) ?? `Source status is ${row.status}.`,
    rejectedAt: row.updated_at,
  };
}

function intentPreview(row: SurfacedItemRow): LibraryPreviewIntentItem {
  const intent = readItemIntent(row.payload);
  return {
    id: row.id,
    title: row.title ?? "Untitled item",
    status: row.status,
    destination: row.destination,
    intent: intent?.state ?? row.planning_state,
    reason: intent?.reason ?? null,
    updatedAt: row.updated_at,
  };
}

function reasonSummary(value: Json | null | undefined): string | null {
  if (!isRecord(value)) return null;
  const summary = value.summary;
  if (typeof summary === "string" && summary.trim()) return summary.trim();
  const reason = value.reason;
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  const statusReason = value.status_reason;
  if (typeof statusReason === "string" && statusReason.trim()) return statusReason.trim();
  return null;
}

function sourceLabel(value: Json | null | undefined): string | null {
  if (!isRecord(value)) return null;
  const source = value.source;
  if (typeof source === "string" && source.trim()) return source.trim();
  const provider = value.provider;
  if (typeof provider === "string" && provider.trim()) return provider.trim();
  const payload = value.payload;
  if (isRecord(payload)) {
    const nestedSource = payload.source;
    if (typeof nestedSource === "string" && nestedSource.trim()) return nestedSource.trim();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
