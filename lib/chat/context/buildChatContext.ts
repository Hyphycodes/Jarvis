import "server-only";

import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { getTodayContext } from "@/lib/chat/context/getTodayContext";
import { getRadarContext } from "@/lib/chat/context/getRadarContext";
import { getPlanContext } from "@/lib/chat/context/getPlanContext";
import { getCircleContext } from "@/lib/chat/context/getCircleContext";
import { getPreferenceContext } from "@/lib/chat/context/getPreferenceContext";
import { getRecentSignalsContext } from "@/lib/chat/context/getRecentSignalsContext";
import { getConstraintContext } from "@/lib/chat/context/getConstraintContext";
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

  const supabase = await getServerSupabase();
  const { data: profileData } = await supabase
    .from("profiles")
    .select("display_name,home_city,timezone")
    .eq("id", userId)
    .maybeSingle();
  const profile = (profileData ?? {}) as {
    display_name?: string | null;
    home_city?: string | null;
    timezone?: string | null;
  };

  const [today, preferencePack, activePlans, radar, circle, recentSignals] =
    await Promise.all([
      getTodayContext(profile, { includeWeather: options.includeWeather }),
      getPreferenceContext(supabase, userId),
      getPlanContext(supabase, userId),
      getRadarContext(supabase, userId),
      getCircleContext(supabase, userId),
      getRecentSignalsContext(supabase, userId),
    ]);

  const user = {
    ...preferencePack.user,
    displayName: profile.display_name ?? null,
    homeCity: profile.home_city ?? today.homeCity,
  };
  const constraints = getConstraintContext({
    today,
    user,
    preferences: preferencePack.preferences,
    activePlans,
  });

  const packet: ChatContextPacket = {
    today,
    user,
    activePlans,
    radar,
    circle,
    preferences: preferencePack.preferences,
    recentSignals,
    constraints,
  };

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
