import "server-only";

import { requireOwner } from "@/lib/auth";
import { upsertSourceFromCandidate } from "@/lib/library/sourceGraph";
import { upsertCandidateInboxFromIndexedCandidate } from "@/lib/radar/candidateInbox";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { rowToIndexedItem } from "@/lib/index/repo";
import { normalizeRadarClassification } from "@/lib/radar/category";
import { resolveItemImage, isHttpUrl } from "@/lib/sources/images";
import type {
  CreateIndexedItemInput,
  IndexDestination,
  IndexedItem,
} from "@/lib/index/types";
import type {
  Json,
  SurfacedItemInsert,
  SurfacedItemRow,
} from "@/lib/types/database";

export type IngestSummary = {
  source: string;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};

/**
 * Lifecycle states a user has acted on. Never overwritten by ingestion.
 */
const PROTECTED_STATUSES = new Set([
  "saved",
  "passed",
  "planned",
  "completed",
  "archived",
  "opened",
]);

export async function ingestCandidates(input: {
  source: string;
  candidates: CreateIndexedItemInput[];
  destination?: IndexDestination;
  userId?: string;
}): Promise<IngestSummary> {
  const summary: IngestSummary = {
    source: input.source,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  if (input.candidates.length === 0) return summary;

  // Best-effort: give every candidate without an image a real photo attempt, all
  // in parallel (total time ≈ slowest source). Failures leave imageUrl null — a
  // great fit with no image still surfaces; the card renders a tasteful fallback.
  await Promise.all(
    input.candidates.map(async (candidate) => {
      if (isHttpUrl(candidate.imageUrl)) return;
      const classification = normalizeRadarClassification({
        category: candidate.category,
        type: candidate.type,
        title: candidate.title,
        subtitle: candidate.subtitle,
        description: candidate.description,
        locationName: candidate.locationName,
        startsAt: candidate.startsAt,
        tags: candidate.tags,
        reasons: candidate.reasons,
        sourcePayload: candidate.rawPayload,
      });
      const resolved = await resolveItemImage({
        name: candidate.title,
        city: candidate.locationName ?? null,
        category: classification.category,
        url: candidate.url ?? null,
        lat: candidate.lat ?? null,
        lng: candidate.lng ?? null,
        existingImageUrl: candidate.imageUrl ?? null,
      });
      if (resolved) candidate.imageUrl = resolved.url;
    }),
  );

  const owner = input.userId ? { id: input.userId } : await requireOwner();
  const supabase = await getServerSupabase();

  const sourceIds = input.candidates
    .map((c) => c.sourceId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const existingBySourceId = new Map<string, SurfacedItemRow>();
  if (sourceIds.length > 0) {
    const { data, error } = await supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", owner.id)
      .eq("source", input.source)
      .in("source_id", sourceIds);
    if (error) {
      summary.errors.push(`select existing: ${error.message}`);
    } else {
      for (const row of (data ?? []) as SurfacedItemRow[]) {
        if (row.source_id) existingBySourceId.set(row.source_id, row);
      }
    }
  }

  for (const candidate of input.candidates) {
    try {
      const result = await upsertOne(owner.id, input.source, candidate, {
        existing: candidate.sourceId
          ? existingBySourceId.get(candidate.sourceId)
          : undefined,
        destinationOverride: input.destination,
      });
      if (result === "inserted") summary.inserted++;
      else if (result === "updated") summary.updated++;
      else summary.skipped++;
      if (result !== "skipped") {
        await Promise.allSettled([
          upsertCandidateInboxFromIndexedCandidate({
            userId: owner.id,
            source: input.source,
            candidate,
            supabase,
          }),
          upsertSourceFromCandidate({
            userId: owner.id,
            sourceName: input.source,
            candidate,
            supabase,
          }),
        ]);
      }
    } catch (err) {
      summary.errors.push(
        err instanceof Error ? err.message : "unknown upsert error",
      );
    }
  }

  return summary;
}

export async function upsertCandidate(
  candidate: CreateIndexedItemInput,
): Promise<IndexedItem> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  let existing: SurfacedItemRow | undefined;
  if (candidate.sourceId) {
    const { data } = await supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", owner.id)
      .eq("source", candidate.source ?? "system")
      .eq("source_id", candidate.sourceId)
      .maybeSingle();
    existing = (data ?? undefined) as SurfacedItemRow | undefined;
  }
  await upsertOne(owner.id, candidate.source ?? "system", candidate, {
    existing,
  });

  const lookupQuery = candidate.sourceId
    ? supabase
        .from("surfaced_items")
        .select("*")
        .eq("user_id", owner.id)
        .eq("source", candidate.source ?? "system")
        .eq("source_id", candidate.sourceId)
        .maybeSingle()
    : supabase
        .from("surfaced_items")
        .select("*")
        .eq("user_id", owner.id)
        .eq("title", candidate.title)
        .order("updated_at", { ascending: false })
        .limit(1);
  const { data } = await lookupQuery;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("upsertCandidate: row not found after upsert");
  return rowToIndexedItem(row as SurfacedItemRow);
}

export async function expireOldCandidates(userId?: string): Promise<number> {
  const owner = userId ? { id: userId } : await requireOwner();
  const supabase = await getServerSupabase();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("surfaced_items")
    .update({ status: "expired" })
    .eq("user_id", owner.id)
    .lt("expires_at", nowIso)
    .in("status", ["discovered", "shown"])
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function enrichCandidate(
  candidateId: string,
  patch: Partial<CreateIndexedItemInput>,
): Promise<void> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const update: SurfacedItemInsert = {} as SurfacedItemInsert;
  if (patch.description != null) update.description = patch.description;
  if (patch.imageUrl != null) update.image_url = patch.imageUrl;
  if (patch.url != null) update.url = patch.url;
  if (patch.reasons) update.reasons = patch.reasons;
  if (patch.tags) update.tags = patch.tags;
  if (patch.score != null) update.score = patch.score;
  if (patch.startsAt != null) update.starts_at = patch.startsAt;
  if (patch.endsAt != null) update.ends_at = patch.endsAt;
  if (patch.expiresAt != null) update.expires_at = patch.expiresAt;
  if (patch.rawPayload != null) update.payload = patch.rawPayload;
  const { error } = await supabase
    .from("surfaced_items")
    .update(update)
    .eq("id", candidateId)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
}

async function upsertOne(
  userId: string,
  source: string,
  candidate: CreateIndexedItemInput,
  options: {
    existing?: SurfacedItemRow;
    destinationOverride?: IndexDestination;
  },
): Promise<"inserted" | "updated" | "skipped"> {
  const supabase = await getServerSupabase();
  const existing = options.existing;
  const destination = options.destinationOverride ?? candidate.destination;

  if (existing && PROTECTED_STATUSES.has(existing.status)) {
    return "skipped";
  }

  const classification = normalizeRadarClassification({
    category: candidate.category,
    type: candidate.type,
    title: candidate.title,
    subtitle: candidate.subtitle,
    description: candidate.description,
    locationName: candidate.locationName,
    startsAt: candidate.startsAt,
    tags: candidate.tags,
    reasons: candidate.reasons,
    sourcePayload: candidate.rawPayload,
  });
  const base: SurfacedItemInsert = {
    user_id: userId,
    destination,
    source,
    source_id: candidate.sourceId ?? null,
    type: classification.type ?? candidate.type,
    category: classification.category,
    title: candidate.title,
    subtitle: candidate.subtitle ?? null,
    description: candidate.description ?? null,
    location_name: candidate.locationName ?? null,
    address: candidate.address ?? null,
    lat: candidate.lat ?? null,
    lng: candidate.lng ?? null,
    starts_at: candidate.startsAt ?? null,
    ends_at: candidate.endsAt ?? null,
    expires_at: candidate.expiresAt ?? null,
    url: candidate.url ?? null,
    image_url: candidate.imageUrl ?? null,
    payload: (candidate.rawPayload ?? {}) as Json,
    score: candidate.score ?? null,
    reasons: candidate.reasons ?? [],
    tags: candidate.tags ?? [],
  };

  if (!existing) {
    base.status = candidate.status ?? "discovered";
    const { error } = await supabase.from("surfaced_items").insert(base);
    if (error) throw new Error(`insert ${source}: ${error.message}`);
    return "inserted";
  }

  // Update only — do not reset lifecycle status on rediscovery.
  const { error } = await supabase
    .from("surfaced_items")
    .update(base)
    .eq("id", existing.id)
    .eq("user_id", userId);
  if (error) throw new Error(`update ${source}: ${error.message}`);
  return "updated";
}

export type RadarBatchContext = {
  userId: string;
  homeLat: number;
  homeLng: number;
  city?: string;
  state?: string;
};

/**
 * Pulls a controlled batch from each configured source, normalizes, and
 * ingests into `surfaced_items` (status='discovered'). The shape lives in
 * `runRadarCuration` — this is just convenience for ad-hoc backfills.
 */
export async function ingestRadarBatch(input: {
  context: RadarBatchContext;
}): Promise<{ summaries: IngestSummary[] }> {
  // Defer to the brain runner for the actual orchestration; kept here as
  // an extension point so callers can ingest without running curation.
  const { gatherRadarCandidates } = await import("@/lib/sources/gather");
  const lanes = await gatherRadarCandidates(input.context);
  const summaries: IngestSummary[] = [];
  for (const lane of lanes) {
    summaries.push(
      await ingestCandidates({
        source: lane.source,
        candidates: lane.candidates,
        destination: "radar",
      }),
    );
  }
  return { summaries };
}
