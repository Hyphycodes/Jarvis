import { getViewableProfileId, requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { embedOne } from "@/lib/ai/embeddings";
import type { MemoryItemRow } from "@/lib/types/database";
import type { MemoryItem, MemoryType } from "@/lib/memory/types";

const MEMORY_TYPE_FALLBACK: Record<string, MemoryType> = {
  identity: "decision_rule",
  preference: "taste",
  pattern: "confirmed_behavior",
  principle: "decision_rule",
  context: "confirmed_behavior",
};

export async function listActiveMemory(): Promise<MemoryItem[]> {
  const { id } = await getViewableProfileId();
  if (!id) return [];
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("memory_items")
    .select("*")
    .eq("user_id", id)
    .eq("status", "active")
    .order("is_pinned", { ascending: false })
    .order("confidence", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MemoryItemRow[]).map(toMemoryItem);
}

export async function createCanonicalMemory(input: {
  type: MemoryType;
  content: string;
  confidence: number;
  source: MemoryItem["source"];
  tags?: string[];
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("memory_items")
    .insert({
      user_id: owner.id,
      content: input.content,
      kind: input.type,
      status: "active",
      confidence: input.confidence,
      source: input.source,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Embed-on-write. Fully isolated from insert success — a failed or
  // unconfigured embedding leaves the row without a vector and recency
  // retrieval still works. Never throws back to the caller.
  try {
    const embedInput = [input.content, ...(input.tags ?? [])]
      .filter(Boolean)
      .join(" ");
    const embedding = await embedOne(embedInput);
    if (embedding) {
      await supabase
        .from("memory_items")
        .update({ embedding })
        .eq("id", data.id)
        .eq("user_id", owner.id);
    }
  } catch (err) {
    console.error("[memory] embed-on-write failed", err);
  }

  return data.id;
}

/**
 * Semantic memory retrieval via pgvector cosine distance.
 *
 * Embeds `contextQuery` and returns the closest active memories for the user.
 * Falls back to recency-ordered `listActiveMemory()` whenever embeddings are
 * unavailable (no provider key, embed failure) or no embedded rows exist yet.
 */
export async function semanticMemorySearch(
  contextQuery: string,
  userId: string,
  limit = 8,
): Promise<MemoryItem[]> {
  const query = contextQuery.trim();
  if (!query) return listActiveMemory();

  const embedding = await embedOne(query);
  if (!embedding) return listActiveMemory();

  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc("match_memories", {
      query_embedding: embedding,
      match_user_id: userId,
      match_limit: limit,
    });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as MemoryItemRow[];
    if (rows.length === 0) return listActiveMemory();
    return rows.map(toMemoryItem);
  } catch (err) {
    console.error("[memory] semanticMemorySearch failed", err);
    return listActiveMemory();
  }
}

export function toMemoryItem(row: MemoryItemRow): MemoryItem {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const type = toMemoryType(row.kind);
  const source = toMemorySource(row.source);
  return {
    id: row.id,
    type,
    content: row.content,
    confidence: Number(row.confidence),
    source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at ?? row.last_reinforced_at ?? undefined,
    usageCount: row.usage_count ?? row.frequency ?? 0,
    status:
      row.status === "active" ||
      row.status === "pending" ||
      row.status === "rejected" ||
      row.status === "archived"
        ? row.status
        : "archived",
    tags: row.tags ?? readTagsFromMetadata(metadata),
  };
}

function toMemoryType(kind: string): MemoryType {
  if (
    kind === "taste" ||
    kind === "avoidance" ||
    kind === "decision_rule" ||
    kind === "relationship" ||
    kind === "north_goal" ||
    kind === "place_history" ||
    kind === "event_history" ||
    kind === "confirmed_behavior"
  ) {
    return kind;
  }
  return MEMORY_TYPE_FALLBACK[kind] ?? "confirmed_behavior";
}

function toMemorySource(source: string | null): MemoryItem["source"] {
  if (
    source === "explicit" ||
    source === "inferred" ||
    source === "behavior" ||
    source === "system"
  ) {
    return source;
  }
  if (source === "manual") return "explicit";
  if (source === "ai") return "inferred";
  return "system";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTagsFromMetadata(metadata: Record<string, unknown>): string[] {
  const tags = metadata.tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}
