import "server-only";

import { getViewableProfileId, requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { readBriefingFromPayload } from "@/lib/brain/briefingTypes";
import type {
  IndexItemStatus,
  SurfacedItemRow,
} from "@/lib/types/database";
import type {
  CreateIndexedItemInput,
  IndexDestination,
  IndexItemType,
  IndexedItem,
  ListIndexItemsFilter,
} from "@/lib/index/types";

const ALL_DESTINATIONS = new Set<IndexDestination>([
  "today",
  "radar",
  "north",
  "circle",
  "plan",
  "holding",
  "upcoming",
]);

export function rowToIndexedItem(row: SurfacedItemRow): IndexedItem {
  return {
    id: row.id,
    source: (row.source ?? "system") as IndexedItem["source"],
    sourceId: row.source_id ?? undefined,
    type: (row.type ?? "recommendation") as IndexItemType,
    category: row.category ?? undefined,
    title: row.title ?? "Untitled",
    subtitle: row.subtitle ?? undefined,
    description: row.description ?? undefined,
    locationName: row.location_name ?? undefined,
    address: row.address ?? undefined,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    startsAt: row.starts_at ?? undefined,
    endsAt: row.ends_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    url: row.url ?? undefined,
    imageUrl: row.image_url ?? undefined,
    rawPayload: row.payload,
    briefing: readBriefingFromPayload(row.payload) ?? undefined,
    status: row.status,
    destination: normalizeDestination(row.destination),
    score: row.score ?? undefined,
    reasons: row.reasons ?? [],
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listIndexItems(
  filter: ListIndexItemsFilter = {},
): Promise<IndexedItem[]> {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return [];

    const supabase = await getServerSupabase();
    let query = supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", id)
      .order("updated_at", { ascending: false });

    const destinations = toArray(filter.destination);
    if (destinations.length === 1) {
      query = query.eq("destination", destinations[0]);
    } else if (destinations.length > 1) {
      query = query.in("destination", destinations);
    }

    const types = toArray(filter.type);
    if (types.length === 1) {
      query = query.eq("type", types[0]);
    } else if (types.length > 1) {
      query = query.in("type", types);
    }

    const statuses = toArray(filter.status);
    if (statuses.length === 1) {
      query = query.eq("status", statuses[0]);
    } else if (statuses.length > 1) {
      query = query.in("status", statuses);
    }

    if (!filter.includeExpired) {
      const nowIso = new Date().toISOString();
      query = query.or(`expires_at.is.null,expires_at.gt.${nowIso}`);
    }

    if (filter.limit) query = query.limit(filter.limit);

    const { data, error } = await query;
    if (error) {
      logIndexReadError("listIndexItems", error);
      return [];
    }
    return ((data ?? []) as SurfacedItemRow[]).map(rowToIndexedItem);
  } catch (error) {
    logIndexReadError("listIndexItems", error);
    return [];
  }
}

export async function getIndexItem(itemId: string): Promise<IndexedItem | null> {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return null;
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("surfaced_items")
      .select("*")
      .eq("id", itemId)
      .eq("user_id", id)
      .maybeSingle();
    if (error) {
      logIndexReadError("getIndexItem", error);
      return null;
    }
    if (!data) return null;
    return rowToIndexedItem(data as SurfacedItemRow);
  } catch (error) {
    logIndexReadError("getIndexItem", error);
    return null;
  }
}

export async function createIndexItem(
  input: CreateIndexedItemInput,
): Promise<IndexedItem> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("surfaced_items")
    .insert({
      user_id: owner.id,
      destination: input.destination,
      source: input.source ?? "system",
      source_id: input.sourceId ?? null,
      type: input.type,
      category: input.category ?? null,
      title: input.title,
      subtitle: input.subtitle ?? null,
      description: input.description ?? null,
      location_name: input.locationName ?? null,
      address: input.address ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      expires_at: input.expiresAt ?? null,
      url: input.url ?? null,
      image_url: input.imageUrl ?? null,
      payload: (input.rawPayload ?? {}) as SurfacedItemRow["payload"],
      status: input.status ?? "discovered",
      score: input.score ?? null,
      reasons: input.reasons ?? [],
      tags: input.tags ?? [],
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToIndexedItem(data as SurfacedItemRow);
}

export async function updateIndexItemStatus(
  itemId: string,
  status: IndexItemStatus,
  patch: Partial<Pick<SurfacedItemRow, "payload" | "score">> = {},
): Promise<void> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("surfaced_items")
    .update({ status, ...patch })
    .eq("id", itemId)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);
}

export async function expireDueItems(): Promise<number> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("surfaced_items")
    .update({ status: "expired" })
    .eq("user_id", owner.id)
    .lt("expires_at", nowIso)
    .not("status", "in", "(expired,archived,completed)")
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeDestination(destination: string): IndexDestination {
  if (ALL_DESTINATIONS.has(destination as IndexDestination)) {
    return destination as IndexDestination;
  }
  if (destination.startsWith("today")) return "today";
  if (destination.startsWith("radar")) return "radar";
  if (destination.startsWith("north")) return "north";
  if (destination.startsWith("circle")) return "circle";
  if (destination.startsWith("plan")) return "plan";
  if (destination === "holding") return "holding";
  if (destination === "upcoming") return "upcoming";
  return "radar";
}

function logIndexReadError(scope: string, error: unknown) {
  console.error("[surface-loader]", scope, error);
}
