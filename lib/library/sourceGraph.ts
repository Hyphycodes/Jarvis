import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  scheduleNextSourceCheck,
  scoreSourceQuality,
} from "@/lib/library/sourceScoring";
import { sourceKeyFromUrl } from "@/lib/library/sourceIdentity";
import type { SourceGraphRow, SourceStatus, SourceType } from "@/lib/library/sourceGraphTypes";
import type { CreateIndexedItemInput, IndexedItem } from "@/lib/index/types";

export { scheduleNextSourceCheck, scoreSourceQuality };
export type { SourceGraphRow, SourceStatus, SourceType };

export async function upsertSourceFromCandidate(input: {
  userId: string;
  sourceName: string;
  candidate: CreateIndexedItemInput;
  supabase?: SupabaseClient;
}): Promise<string | null> {
  const key = sourceKeyForCandidate(input.sourceName, input.candidate);
  if (!key) return null;
  const supabase = input.supabase ?? await getServerSupabase();
  const url = input.candidate.url;
  const domain = sourceKeyFromUrl(url) ?? domainFromSourceKey(key);
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("intelligence_sources")
    .select("*")
    .eq("user_id", input.userId)
    .eq("source_key", key)
    .maybeSingle();
  const row = existing as SourceGraphRow | null;
  const totalCandidates = (row?.total_candidates ?? 0) + 1;
  const quality = scoreSourceQuality({
    ...row,
    total_candidates: totalCandidates,
    total_saved: row?.total_saved ?? 0,
    total_passed: row?.total_passed ?? 0,
    total_planned: row?.total_planned ?? 0,
    total_promoted: row?.total_promoted ?? 0,
    total_library_items: row?.total_library_items ?? 0,
    duplicate_rate: row?.duplicate_rate ?? 0,
    freshness_score: 0.58,
    trust_score: row?.trust_score ?? 0.5,
    taste_fit_score: Math.max(row?.taste_fit_score ?? 0.5, input.candidate.score ?? 0.5),
    novelty_score: row?.novelty_score ?? 0.5,
  });

  const payload = {
    user_id: input.userId,
    source_key: key,
    source_type: sourceTypeForKey(key, input.sourceName),
    url: url ?? row?.url ?? null,
    domain,
    name: row?.name ?? sourceNameFromKey(key, input.sourceName),
    topics: mergeTopics(row?.topics ?? [], input.candidate.tags ?? [], input.candidate.category),
    trust_score: row?.trust_score ?? 0.5,
    taste_fit_score: quality.score,
    novelty_score: row?.novelty_score ?? 0.5,
    freshness_score: 0.58,
    total_candidates: totalCandidates,
    cadence_hours: quality.cadenceHours,
    status: quality.status,
    next_check_at: scheduleNextSourceCheck({ ...quality, from: now }),
    updated_at: now,
    metadata: {
      ...(row?.metadata ?? {}),
      last_candidate_title: input.candidate.title,
    },
  };

  const { data, error } = await supabase
    .from("intelligence_sources")
    .upsert(payload, { onConflict: "user_id,source_key" })
    .select("id")
    .single();
  if (error) {
    console.warn("[sourceGraph] candidate source upsert failed", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

export async function upsertSourceFromLibraryEntity(input: {
  userId: string;
  title: string;
  url?: string | null;
  sourceKey?: string | null;
  entityType: "place" | "event" | "source" | "person" | "organization" | "recurring_signal";
  qualityScore?: number | null;
  topics?: string[];
  supabase?: SupabaseClient;
}): Promise<string | null> {
  const key = input.sourceKey ?? sourceKeyFromUrl(input.url) ?? slug(input.title);
  if (!key) return null;
  const supabase = input.supabase ?? await getServerSupabase();
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("intelligence_sources")
    .select("*")
    .eq("user_id", input.userId)
    .eq("source_key", key)
    .maybeSingle();
  const row = existing as SourceGraphRow | null;
  const totalLibraryItems = (row?.total_library_items ?? 0) + 1;
  const quality = scoreSourceQuality({
    ...row,
    total_candidates: row?.total_candidates ?? 0,
    total_saved: row?.total_saved ?? 0,
    total_passed: row?.total_passed ?? 0,
    total_planned: row?.total_planned ?? 0,
    total_promoted: row?.total_promoted ?? 0,
    total_library_items: totalLibraryItems,
    duplicate_rate: row?.duplicate_rate ?? 0,
    freshness_score: 0.64,
    trust_score: Math.max(row?.trust_score ?? 0.5, input.qualityScore ?? 0.5),
    taste_fit_score: Math.max(row?.taste_fit_score ?? 0.5, input.qualityScore ?? 0.5),
    novelty_score: row?.novelty_score ?? 0.5,
  });
  const { data, error } = await supabase
    .from("intelligence_sources")
    .upsert({
      user_id: input.userId,
      source_key: key,
      source_type: input.entityType === "event" ? "calendar" : "domain",
      url: input.url ?? row?.url ?? null,
      domain: sourceKeyFromUrl(input.url) ?? row?.domain ?? null,
      name: row?.name ?? input.title,
      topics: mergeTopics(row?.topics ?? [], input.topics ?? [], input.entityType),
      trust_score: quality.score,
      taste_fit_score: quality.score,
      novelty_score: row?.novelty_score ?? 0.5,
      freshness_score: 0.64,
      total_library_items: totalLibraryItems,
      cadence_hours: quality.cadenceHours,
      status: quality.status,
      next_check_at: scheduleNextSourceCheck({ ...quality, from: now }),
      updated_at: now,
    }, { onConflict: "user_id,source_key" })
    .select("id")
    .single();
  if (error) {
    console.warn("[sourceGraph] library source upsert failed", error.message);
    return null;
  }
  return (data as { id: string }).id;
}

export async function updateSourceStatsFromAction(input: {
  userId: string;
  item: IndexedItem;
  action:
    | "saved"
    | "passed"
    | "planned"
    | "dismissed"
    | "completed"
    | "archived"
    | "interested_later"
    | "watching"
    | "better_version"
    | "muted";
  supabase?: SupabaseClient;
}): Promise<void> {
  const key = sourceKeyForItem(input.item);
  if (!key) return;
  const supabase = input.supabase ?? await getServerSupabase();
  const { data } = await supabase
    .from("intelligence_sources")
    .select("*")
    .eq("user_id", input.userId)
    .eq("source_key", key)
    .maybeSingle();
  const row = data as SourceGraphRow | null;
  const totals = {
    total_saved: (row?.total_saved ?? 0) + (["saved", "interested_later", "watching"].includes(input.action) ? 1 : 0),
    total_passed: (row?.total_passed ?? 0) + (["passed", "better_version", "muted"].includes(input.action) ? 1 : 0),
    total_planned: (row?.total_planned ?? 0) + (input.action === "planned" ? 1 : 0),
    total_promoted: (row?.total_promoted ?? 0) + (input.item.destination === "radar" ? 1 : 0),
    total_candidates: Math.max(row?.total_candidates ?? 0, 1),
    total_library_items: row?.total_library_items ?? 0,
  };
  const actionCount = Math.max(1, totals.total_saved + totals.total_passed + totals.total_planned);
  const saveRate = totals.total_saved / actionCount;
  const passRate = totals.total_passed / actionCount;
  const planRate = totals.total_planned / actionCount;
  const quality = scoreSourceQuality({
    ...row,
    ...totals,
    save_rate: saveRate,
    pass_rate: passRate,
    plan_rate: planRate,
    duplicate_rate: row?.duplicate_rate ?? 0,
    trust_score: row?.trust_score ?? 0.5,
    taste_fit_score: row?.taste_fit_score ?? 0.5,
    novelty_score: row?.novelty_score ?? 0.5,
    freshness_score: row?.freshness_score ?? 0.5,
  });
  await supabase
    .from("intelligence_sources")
    .upsert({
      user_id: input.userId,
      source_key: key,
      source_type: sourceTypeForItem(input.item),
      url: input.item.url ?? row?.url ?? null,
      domain: sourceKeyFromUrl(input.item.url) ?? row?.domain ?? null,
      name: row?.name ?? input.item.source,
      topics: mergeTopics(row?.topics ?? [], input.item.tags ?? [], input.item.category),
      ...totals,
      save_rate: saveRate,
      pass_rate: passRate,
      plan_rate: planRate,
      trust_score: quality.score,
      taste_fit_score: quality.score,
      cadence_hours: quality.cadenceHours,
      status: quality.status,
      next_check_at: scheduleNextSourceCheck({ ...quality, from: new Date().toISOString() }),
      metadata: {
        ...(row?.metadata ?? {}),
        intent_feedback: {
          ...readRecord(row?.metadata, "intent_feedback"),
          [input.action]: Number(readRecord(row?.metadata, "intent_feedback")[input.action] ?? 0) + 1,
        },
        last_intent_item: input.item.title,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,source_key" });
}

export async function selectSourcesDueForCheck(input: {
  userId: string;
  limit?: number;
  supabase?: SupabaseClient;
}): Promise<SourceGraphRow[]> {
  const supabase = input.supabase ?? await getServerSupabase();
  const limit = input.limit ?? 8;
  const { data } = await supabase
    .from("intelligence_sources")
    .select("*")
    .eq("user_id", input.userId)
    .in("status", ["testing", "watching", "cooldown"])
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true, nullsFirst: true })
    .limit(Math.max(limit * 5, limit));
  const staleCutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return ((data ?? []) as SourceGraphRow[]).sort((a, b) => compareSourceProductionPriority(a, b, staleCutoffMs)).slice(0, limit);
}

export function sourceKeyForItem(item: IndexedItem): string | null {
  return sourceKeyFromUrl(item.url) ?? (item.sourceId ? `${item.source}:${item.sourceId}` : item.source ?? null);
}

function sourceKeyForCandidate(sourceName: string, candidate: CreateIndexedItemInput): string | null {
  return sourceKeyFromUrl(candidate.url) ?? (candidate.sourceId ? `${sourceName}:${candidate.sourceId}` : sourceName);
}

function sourceTypeForItem(item: IndexedItem): SourceType {
  if (item.source === "calendar") return "calendar";
  if (item.source === "places") return "venue";
  if (sourceKeyFromUrl(item.url)) return "domain";
  return "search_pattern";
}

function compareSourceProductionPriority(a: SourceGraphRow, b: SourceGraphRow, staleCutoffMs: number): number {
  const priorityDiff = sourceProductionPriority(a, staleCutoffMs) - sourceProductionPriority(b, staleCutoffMs);
  if (priorityDiff !== 0) return priorityDiff;
  return timestampMs(a.last_produced_at) - timestampMs(b.last_produced_at)
    || timestampMs(a.next_check_at) - timestampMs(b.next_check_at)
    || timestampMs(a.updated_at) - timestampMs(b.updated_at);
}

function sourceProductionPriority(row: SourceGraphRow, staleCutoffMs: number): number {
  const producedAt = timestampMs(row.last_produced_at);
  if (producedAt === 0) return 0;
  if (producedAt < staleCutoffMs) return 1;
  return 2;
}

function timestampMs(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceTypeForKey(key: string, sourceName: string): SourceType {
  if (sourceName.includes("event")) return "calendar";
  if (key.includes(".")) return "domain";
  if (sourceName.includes("tastemaker")) return "tastemaker";
  return "search_pattern";
}

function sourceNameFromKey(key: string, fallback: string): string {
  return key.includes(":") ? fallback : key;
}

function domainFromSourceKey(key: string): string | null {
  return key.includes(".") && !key.includes(" ") ? key : null;
}

function mergeTopics(existing: string[], tags: string[], category?: string | null): string[] {
  return Array.from(new Set([...existing, ...tags, category].filter((value): value is string => Boolean(value)))).slice(0, 16);
}

function readRecord(value: unknown, key: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : {};
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
