import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type { CreateIndexedItemInput } from "@/lib/index/types";
import type { Json } from "@/lib/types/database";

export type CandidateInboxStatus =
  | "new"
  | "evaluated"
  | "library"
  | "held"
  | "promoted"
  | "rejected"
  | "duplicate"
  | "stale";

export type CandidateInboxEntityType =
  | "place"
  | "event"
  | "source"
  | "person"
  | "organization"
  | "neighborhood"
  | "recurring_signal"
  | "opportunity"
  | "other";

export type CandidateInboxSummary = {
  created: number;
  updated: number;
  skipped: number;
};

export async function upsertCandidateInboxItem(input: {
  userId: string;
  title: string;
  entityType?: CandidateInboxEntityType;
  description?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  campaignId?: string | null;
  sourceId?: string | null;
  rawPayload?: Json;
  status?: CandidateInboxStatus;
  score?: number | null;
  reason?: Json | null;
  rejectionReason?: string | null;
  supabase?: SupabaseClient;
}): Promise<"created" | "updated" | "skipped"> {
  const title = input.title.trim();
  if (!title) return "skipped";
  const supabase = input.supabase ?? await getServerSupabase();
  const now = new Date().toISOString();
  const row = {
    user_id: input.userId,
    source_id: input.sourceId ?? null,
    campaign_id: input.campaignId ?? null,
    title,
    description: input.description ?? null,
    url: input.url ?? candidateSyntheticUrl(input.userId, title),
    image_url: input.imageUrl ?? null,
    entity_type: input.entityType ?? "other",
    raw_payload: input.rawPayload ?? {},
    status: input.status ?? "new",
    score: typeof input.score === "number" ? clamp01(input.score) : null,
    reason: input.reason ?? null,
    rejection_reason: input.rejectionReason ?? null,
    evaluated_at: input.status && input.status !== "new" ? now : null,
    updated_at: now,
  };

  const { data: existing } = await supabase
    .from("radar_candidate_inbox")
    .select("id,status")
    .eq("user_id", input.userId)
    .eq("url", row.url)
    .maybeSingle();
  const existingId = (existing as { id?: string; status?: string } | null)?.id;

  // Secondary dedup: same normalized title from a different URL.
  // Catches the same article ingested from two different sources. This is a
  // soft dedup — it skips rather than merging, which is correct since the same
  // article from two sources carries the same junk content either way.
  if (!existingId) {
    const normalizedTitle = normalizeCandidateTitle(title);
    const { data: titleMatches } = await supabase
      .from("radar_candidate_inbox")
      .select("id, title, status")
      .eq("user_id", input.userId)
      .ilike("title", `%${escapeLike(title.slice(0, 48))}%`)
      .limit(10);
    const titleMatchId = ((titleMatches ?? []) as Array<{ id?: string; title?: string | null }>)
      .find((match) => normalizeCandidateTitle(match.title ?? "") === normalizedTitle)
      ?.id;
    if (titleMatchId) {
      // Don't update — just skip the duplicate.
      return "skipped";
    }
  }

  if (existingId) {
    const { error } = await supabase
      .from("radar_candidate_inbox")
      .update(row)
      .eq("id", existingId)
      .eq("user_id", input.userId);
    if (error) {
      console.warn("[candidateInbox] update failed", error.message);
      return "skipped";
    }
    return "updated";
  }

  const { error } = await supabase.from("radar_candidate_inbox").insert(row);
  if (error) {
    console.warn("[candidateInbox] insert failed", error.message);
    return "skipped";
  }
  return "created";
}

export async function upsertCandidateInboxFromIndexedCandidate(input: {
  userId: string;
  source: string;
  candidate: CreateIndexedItemInput;
  campaignId?: string | null;
  supabase?: SupabaseClient;
}): Promise<"created" | "updated" | "skipped"> {
  return upsertCandidateInboxItem({
    userId: input.userId,
    campaignId: input.campaignId,
    title: input.candidate.title,
    description: input.candidate.description,
    url: input.candidate.url ?? (input.candidate.sourceId ? `${input.source}:${input.candidate.sourceId}` : null),
    imageUrl: input.candidate.imageUrl,
    entityType: entityTypeForCandidate(input.candidate.type),
    rawPayload: {
      source: input.source,
      source_id: input.candidate.sourceId ?? null,
      payload: input.candidate.rawPayload ?? {},
      tags: input.candidate.tags ?? [],
    },
    score: input.candidate.score ?? null,
    reason: {
      summary: "Raw discovery captured for evaluation before Holding or Active Radar.",
      destination: input.candidate.destination,
    },
    supabase: input.supabase,
  });
}

export async function syncCandidateInboxFromExistingPipelines(input: {
  userId: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<CandidateInboxSummary> {
  const supabase = input.supabase ?? await getServerSupabase();
  const summary: CandidateInboxSummary = { created: 0, updated: 0, skipped: 0 };
  const limit = input.limit ?? 80;
  const [placesRes, eventsRes, surfacedRes] = await Promise.all([
    supabase
      .from("place_candidates")
      .select("*")
      .eq("user_id", input.userId)
      .in("status", ["pending", "researched", "rejected"])
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("current_events")
      .select("*")
      .eq("user_id", input.userId)
      .in("status", ["pending", "verified", "rejected", "surfaced"])
      .order("discovered_at", { ascending: false })
      .limit(limit),
    supabase
      .from("surfaced_items")
      .select("id,title,description,url,image_url,type,category,status,destination,score,payload,created_at,source,source_id")
      .eq("user_id", input.userId)
      .in("status", ["discovered", "shown", "passed", "archived"])
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  for (const row of (placesRes.data ?? []) as Array<Record<string, unknown>>) {
    count(summary, await upsertCandidateInboxItem({
      userId: input.userId,
      title: String(row.name ?? "Untitled place"),
      url: typeof row.discovered_via === "string" ? row.discovered_via : `place_candidate:${row.id}`,
      entityType: "place",
      rawPayload: row as Json,
      status: mapPlaceCandidateStatus(String(row.status ?? "pending")),
      reason: { source: "place_candidates" },
      supabase,
    }));
  }

  for (const row of (eventsRes.data ?? []) as Array<Record<string, unknown>>) {
    count(summary, await upsertCandidateInboxItem({
      userId: input.userId,
      title: String(row.title ?? "Untitled event"),
      description: typeof row.description === "string" ? row.description : null,
      url: typeof row.ticket_url === "string" ? row.ticket_url : `current_event:${row.id}`,
      entityType: "event",
      rawPayload: row as Json,
      status: mapEventStatus(String(row.status ?? "pending")),
      score: typeof row.verdict_strength === "number" ? row.verdict_strength : null,
      reason: { source: "current_events" },
      supabase,
    }));
  }

  for (const row of (surfacedRes.data ?? []) as Array<Record<string, unknown>>) {
    count(summary, await upsertCandidateInboxItem({
      userId: input.userId,
      title: String(row.title ?? "Untitled item"),
      description: typeof row.description === "string" ? row.description : null,
      url: typeof row.url === "string" ? row.url : `surfaced_item:${row.id}`,
      imageUrl: typeof row.image_url === "string" ? row.image_url : null,
      entityType: entityTypeForCandidate(String(row.type ?? "recommendation")),
      rawPayload: row as Json,
      status: mapSurfacedStatus(String(row.status ?? "discovered"), String(row.destination ?? "")),
      score: typeof row.score === "number" ? row.score : null,
      reason: {
        source: "surfaced_items",
        destination: typeof row.destination === "string" ? row.destination : null,
      },
      supabase,
    }));
  }

  return summary;
}

function count(summary: CandidateInboxSummary, result: "created" | "updated" | "skipped") {
  if (result === "created") summary.created++;
  else if (result === "updated") summary.updated++;
  else summary.skipped++;
}

function normalizeCandidateTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function entityTypeForCandidate(type: string | undefined): CandidateInboxEntityType {
  if (type === "restaurant" || type === "place") return "place";
  if (type === "event" || type === "culture") return "event";
  if (type === "person") return "person";
  if (type === "real_estate" || type === "product" || type === "recommendation") return "opportunity";
  return "other";
}

function mapPlaceCandidateStatus(status: string): CandidateInboxStatus {
  if (status === "rejected") return "rejected";
  if (status === "researched") return "library";
  return "new";
}

function mapEventStatus(status: string): CandidateInboxStatus {
  if (status === "rejected") return "rejected";
  if (status === "surfaced") return "promoted";
  if (status === "verified") return "evaluated";
  return "new";
}

function mapSurfacedStatus(status: string, destination: string): CandidateInboxStatus {
  if (status === "passed" || status === "archived") return "rejected";
  if (destination === "holding") return "held";
  if (destination === "radar" && status === "shown") return "promoted";
  return "evaluated";
}

function candidateSyntheticUrl(userId: string, title: string): string {
  return `candidate:${userId}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
