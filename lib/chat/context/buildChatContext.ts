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
} = {}): Promise<ChatContextPacket> {
  const owner = options.userId ? null : await requireOwner();
  const userId = options.userId ?? owner?.id;
  if (!userId) throw new Error("Missing user id");

  const cacheKey = `${userId}:${options.includeWeather ? "weather" : "no-weather"}`;
  const cached = cache.get(cacheKey);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.packet;
  }

  const founderPacket = await buildFounderContextPacket({
    userId,
    includeWeather: options.includeWeather,
  });
  const packet = toChatContextPacket(founderPacket);

  cache.set(cacheKey, { expiresAt: Date.now() + CONTEXT_TTL_MS, packet });
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
