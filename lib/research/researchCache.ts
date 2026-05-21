import type { ResearchCacheEntry } from "@/lib/research/types";

const memoryCache = new Map<string, ResearchCacheEntry>();

export async function getResearchCache<TPayload = unknown>(
  key: string,
): Promise<ResearchCacheEntry<TPayload> | null> {
  const entry = memoryCache.get(key) as ResearchCacheEntry<TPayload> | undefined;
  if (!entry) return null;
  if (new Date(entry.expiresAt).getTime() <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry;
}

export async function setResearchCache<TPayload>(
  entry: ResearchCacheEntry<TPayload>,
): Promise<void> {
  memoryCache.set(entry.key, entry);
}
