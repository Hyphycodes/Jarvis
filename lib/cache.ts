/**
 * Shared in-memory TTL cache for source-adapter responses.
 *
 * Survives within a single Node process. Not for use across requests in
 * serverless cold-start environments — fine for our long-running dev/server.
 *
 * For higher-tier persistence later, swap the Map for Redis/Supabase row
 * without changing call sites.
 */

type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export const TTL = {
  weather: 30 * 60 * 1_000, // 30 min
  placesSearch: 6 * 60 * 60 * 1_000, // 6 hr
  placeDetails: 24 * 60 * 60 * 1_000, // 24 hr
  events: 6 * 60 * 60 * 1_000, // 6 hr
  webSearch: 60 * 60 * 1_000, // 1 hr
  shopping: 6 * 60 * 60 * 1_000, // 6 hr
  routeGeocode: 6 * 60 * 60 * 1_000, // 6 hr
  short: 5 * 60 * 1_000,
  hour: 60 * 60 * 1_000,
  day: 24 * 60 * 60 * 1_000,
} as const;

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

export function cacheClear(): void {
  store.clear();
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await loader();
  cacheSet(key, value, ttlMs);
  return value;
}
