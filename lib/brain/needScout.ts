import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { buildBrainContext } from "@/lib/brain/context";
import { loadCloset } from "@/lib/wardrobe/closet";
import { createFind, existingFindMissions } from "@/lib/finds/finds";

const DEFAULT_LIMIT = 7;

const SYSTEM_PROMPT = `You are Jarvis's NEED SCOUT. From what Jarvis knows about the owner, identify practical, timely, taste-aligned things he may need to BUY / UPGRADE / SOURCE before he asks — across wardrobe, gear, creative setup, fitness, travel, hosting, home/storage, grooming.

Do NOT spam. Only propose a need when it is practical, timely, taste-aligned, or clearly useful. Be specific — "linen camp shirts for summer", not "clothes"; "compact on-camera light", not "camera stuff".

Taste: refined, intentional, masculine, subtle luxury, durable, culturally aware — never flashy.

Return strict JSON: { "needs": [{ "mission": string, "why": string, "priority": number (1=highest..5) }] }
- At most the requested number of needs. Fewer is fine — quality over quantity.
- Do NOT repeat anything in "already_surfaced".
- Lead with wardrobe gaps and anything tied to upcoming plans or the season.`;

export async function runNeedScout(input: {
  userId: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<{ created: number; proposed: number; missions: string[] }> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!hasAnthropic()) return { created: 0, proposed: 0, missions: [] };

  const [brain, closet, alreadySurfaced] = await Promise.all([
    buildBrainContext({ userId: input.userId, includeWeather: false, supabase }).catch(() => null),
    loadCloset(input.userId, supabase).catch(() => null),
    existingFindMissions(input.userId, supabase).catch(() => []),
  ]);

  // Upcoming dated plans → seasonal/occasion needs.
  const { data: upcomingData } = await supabase
    .from("surfaced_items")
    .select("title, starts_at, category")
    .eq("user_id", input.userId)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(8);
  const upcoming = ((upcomingData ?? []) as Array<{ title: string | null; category: string | null }>)
    .map((u) => `${u.title ?? "plan"}${u.category ? ` (${u.category})` : ""}`)
    .filter(Boolean);

  const context = {
    season: seasonOf(new Date()),
    closet: closet
      ? { counts: closet.counts, gaps: closet.gaps, frequently_worn: closet.frequentlyWorn.slice(0, 5).map((i) => i.description) }
      : null,
    north: brain?.northTags ?? [],
    vibe: brain?.founder?.vibeKeywords ?? [],
    avoid: brain?.founder?.avoidKeywords ?? [],
    recent_signals: (brain?.recentSignals ?? []).slice(0, 8).map((s) => s.signal_type),
    upcoming_plans: upcoming,
    already_surfaced: alreadySurfaced,
    max_needs: limit,
  };

  let proposed: Array<{ mission: string; why: string; priority: number }> = [];
  try {
    const out = await generateStructured<{ needs?: Array<{ mission?: string; why?: string; priority?: number }> }>({
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(context, null, 2),
      schemaName: "NeedScoutNeeds",
      temperature: 0.4,
      maxTokens: 1400,
    });
    proposed = (out.needs ?? [])
      .map((n) => ({
        mission: typeof n.mission === "string" ? n.mission.trim() : "",
        why: typeof n.why === "string" ? n.why.trim() : "",
        priority: typeof n.priority === "number" ? n.priority : 3,
      }))
      .filter((n) => n.mission)
      .sort((a, b) => a.priority - b.priority);
  } catch (err) {
    console.error("[needScout] proposal failed", err instanceof Error ? err.message : err);
    return { created: 0, proposed: 0, missions: [] };
  }

  const existingLower = new Set(alreadySurfaced.map((m) => m.toLowerCase()));
  let created = 0;
  const missions: string[] = [];
  for (const need of proposed.slice(0, limit)) {
    if (existingLower.has(need.mission.toLowerCase())) continue;
    const { itemId } = await createFind({
      userId: input.userId,
      mission: need.mission,
      context: need.why,
      source: "need_scout",
      supabase,
    });
    if (itemId) {
      created++;
      missions.push(need.mission);
    }
  }

  return { created, proposed: proposed.length, missions };
}

function seasonOf(d: Date): string {
  const m = d.getMonth();
  if (m <= 1 || m === 11) return "winter";
  if (m <= 4) return "spring";
  if (m <= 7) return "summer";
  return "fall";
}
