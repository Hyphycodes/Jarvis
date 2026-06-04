import "server-only";

import { requireOwner } from "@/lib/auth";
import { buildFounderContextPacket } from "@/lib/context/founderContextPacket";
import { toChatContextPacket } from "@/lib/context/types";
import type { ChatContextPacket } from "@/lib/chat/context/types";

const CONTEXT_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; packet: ChatContextPacket }>();

export async function buildChatContext(options: {
  userId?: string;
  includeWeather?: boolean;
  forceRefresh?: boolean;
  /**
   * When set, memory is retrieved semantically for this query. The cache is
   * bypassed (read and write) because results are query-specific.
   */
  contextQuery?: string;
} = {}): Promise<ChatContextPacket> {
  const owner = options.userId ? null : await requireOwner();
  const userId = options.userId ?? owner?.id;
  if (!userId) throw new Error("Missing user id");

  const cacheKey = `${userId}:${options.includeWeather ? "weather" : "no-weather"}`;
  const useCache = !options.contextQuery;
  const cached = useCache ? cache.get(cacheKey) : undefined;
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.packet;
  }

  const founderPacket = await buildFounderContextPacket({
    userId,
    includeWeather: options.includeWeather,
    contextQuery: options.contextQuery,
  });
  const packet = toChatContextPacket(founderPacket);

  if (useCache) {
    cache.set(cacheKey, { expiresAt: Date.now() + CONTEXT_TTL_MS, packet });
  }
  return packet;
}

export function clearChatContextCache(userId?: string) {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}
