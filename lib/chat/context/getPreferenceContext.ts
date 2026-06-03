import "server-only";

import type {
  PreferenceContext,
  UserProfileContext,
} from "@/lib/chat/context/types";

export async function getPreferenceContext(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/ssr-server").getServerSupabase>>,
  userId: string,
): Promise<{ user: UserProfileContext; preferences: PreferenceContext[] }> {
  const [founderRes, memoryRes, tasteRes] = await Promise.all([
    supabase
      .from("founder_profile")
      .select("life_direction,current_focus,vibe_keywords,avoid_keywords,dealbreakers,pinned_principles")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("memory_items")
      .select("content,kind,confidence")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("is_pinned", { ascending: false })
      .order("confidence", { ascending: false })
      .limit(18),
    supabase
      .from("taste_signals")
      .select("trait,direction,category,confidence")
      .eq("user_id", userId)
      .order("confidence", { ascending: false })
      .limit(18),
  ]);

  const founder = (founderRes.data ?? {}) as {
    life_direction?: string | null;
    current_focus?: string | null;
    vibe_keywords?: string[] | null;
    avoid_keywords?: string[] | null;
    dealbreakers?: string[] | null;
    pinned_principles?: string[] | null;
  };

  const memoryPrefs = ((memoryRes.data ?? []) as Array<{
    content: string;
    kind: string;
    confidence: number;
  }>).map((row) => ({
    content: row.content,
    kind: row.kind,
    confidence: Number(row.confidence ?? 0),
  }));

  const tastePrefs = ((tasteRes.data ?? []) as Array<{
    trait: string;
    direction: "positive" | "negative";
    category: string | null;
    confidence: number;
  }>).map((row) => ({
    content: row.trait,
    kind: "taste_signal",
    confidence: Number(row.confidence ?? 0),
    category: row.category,
    direction: row.direction,
  }));

  return {
    user: {
      displayName: null,
      homeCity: null,
      lifeDirection: founder.life_direction ?? null,
      currentFocus: founder.current_focus ?? null,
      vibeKeywords: founder.vibe_keywords ?? [],
      avoidKeywords: founder.avoid_keywords ?? [],
      dealbreakers: founder.dealbreakers ?? [],
      pinnedPrinciples: founder.pinned_principles ?? [],
    },
    preferences: [...memoryPrefs, ...tastePrefs].slice(0, 28),
  };
}
