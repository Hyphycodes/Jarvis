import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { embedOne } from "@/lib/ai/embeddings";
import { createCanonicalMemory } from "@/lib/memory/memoryStore";
import type { ResearchPlace } from "@/lib/chat/types";

const CACHE_TAG = "research_cache";
const STALE_DAYS = 7;

/**
 * Write what a discovery answer found to memory so the NEXT adjacent question
 * hits memory first and answers instantly without searching again. The
 * knowledge base grows just from use. Stale after a week, then re-checked.
 */
export async function cacheResearchFindings(input: {
  userId: string;
  query: string;
  answer: string | null;
  places: ResearchPlace[];
}): Promise<void> {
  try {
    const placeLines = input.places
      .map((p) => `${p.name}${p.neighborhood ? ` (${p.neighborhood})` : ""} — ${p.hook}`)
      .join("; ");
    const content =
      `Asked: ${input.query}. ` +
      (input.answer ? `Found: ${input.answer} ` : "") +
      (placeLines ? `Places: ${placeLines}` : "");
    if (content.trim().length < 12) return;
    await createCanonicalMemory({
      type: "confirmed_behavior",
      content: content.slice(0, 1200),
      confidence: 0.55,
      source: "system",
      tags: [CACHE_TAG, "discovery"],
      metadata: {
        research_cache: true,
        query: input.query,
        answer: input.answer,
        places: input.places,
        cached_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[researchCache] write failed", err);
  }
}

export type CachedFindings = {
  query: string;
  answer: string | null;
  places: ResearchPlace[];
  ageDays: number;
};

/**
 * Look for a fresh (≤ a week old) cached discovery answer semantically close to
 * the new question. Returns null on a miss or when the closest hit is stale —
 * the caller then runs a live search and re-caches.
 */
export async function recallResearchFindings(input: {
  userId: string;
  query: string;
}): Promise<CachedFindings | null> {
  try {
    const embedding = await embedOne(input.query);
    if (!embedding) return null;
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc("match_memories", {
      query_embedding: embedding,
      match_user_id: input.userId,
      match_limit: 6,
    });
    if (error || !Array.isArray(data)) return null;

    const now = Date.now();
    for (const row of data as Array<{ tags?: string[] | null; metadata?: unknown }>) {
      if (!row.tags?.includes(CACHE_TAG)) continue;
      const meta = isRecord(row.metadata) ? row.metadata : null;
      if (!meta?.research_cache) continue;
      const cachedAt = typeof meta.cached_at === "string" ? Date.parse(meta.cached_at) : NaN;
      if (Number.isNaN(cachedAt)) continue;
      const ageDays = (now - cachedAt) / 86_400_000;
      if (ageDays > STALE_DAYS) continue;
      const places = sanitizePlaces(meta.places);
      // Only treat it as a usable hit if the materialized places still exist —
      // a cache entry with no live detail routes is worse than re-searching.
      if (!places.length && !meta.answer) continue;
      return {
        query: typeof meta.query === "string" ? meta.query : input.query,
        answer: typeof meta.answer === "string" ? meta.answer : null,
        places,
        ageDays,
      };
    }
    return null;
  } catch (err) {
    console.error("[researchCache] recall failed", err);
    return null;
  }
}

function sanitizePlaces(value: unknown): ResearchPlace[] {
  if (!Array.isArray(value)) return [];
  const out: ResearchPlace[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    if (typeof entry.itemId !== "string" || typeof entry.name !== "string") continue;
    out.push({
      itemId: entry.itemId,
      name: entry.name,
      neighborhood: typeof entry.neighborhood === "string" ? entry.neighborhood : null,
      hook: typeof entry.hook === "string" ? entry.hook : "",
      priceTier: typeof entry.priceTier === "string" ? entry.priceTier : null,
      photoUrl: typeof entry.photoUrl === "string" ? entry.photoUrl : null,
      placeId: typeof entry.placeId === "string" ? entry.placeId : undefined,
    });
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
