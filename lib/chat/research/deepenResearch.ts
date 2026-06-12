import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { judgeTasteFit } from "@/lib/chat/research/judgeTasteFit";
import { recordChatBehaviorSignal } from "@/lib/chat/behaviorSignals";
import type { ChatContextPacket } from "@/lib/chat/context/types";
import type { ResearchPlace } from "@/lib/chat/types";

/**
 * The thread gave the owner a fast answer. This is the quiet deeper pass that
 * runs after, in the background: it judges how well the strongest surfaced
 * places actually fit the owner's taste and, for the ones that clear the bar,
 * enriches their materialized Radar candidate (score, taste read, tags) and
 * fires a taste signal — so the existing candidacy pipeline can carry the best
 * forward. It never touches Today's committed surface; it seeds the system.
 */
export async function deepenResearchPlaces(input: {
  userId: string;
  context: ChatContextPacket;
  places: ResearchPlace[];
}): Promise<void> {
  const places = input.places.slice(0, 2); // only the strongest couple
  if (!places.length) return;

  const supabase = getSupabaseServiceClient();
  for (const place of places) {
    try {
      const taste = await judgeTasteFit({
        context: input.context,
        research: {
          subjectName: place.name,
          subjectType: "place",
          summary: place.hook,
          location: place.neighborhood,
          confidence: 0.6,
        },
      });

      const strong = taste.fit === "strong" || taste.score >= 0.7;
      const { data: existing } = await supabase
        .from("surfaced_items")
        .select("score, tags")
        .eq("id", place.itemId)
        .eq("user_id", input.userId)
        .maybeSingle();
      const prevScore = (existing as { score?: number | null } | null)?.score ?? 0;
      const prevTags = ((existing as { tags?: string[] | null } | null)?.tags ?? []).filter(Boolean);

      await supabase
        .from("surfaced_items")
        .update({
          score: Math.max(prevScore ?? 0, taste.score),
          taste_fit_summary: taste.summary,
          tags: Array.from(new Set([...prevTags, "deep_enriched", `fit_${taste.fit}`])),
        })
        .eq("id", place.itemId)
        .eq("user_id", input.userId);

      if (strong) {
        await recordChatBehaviorSignal({
          userId: input.userId,
          signalType: "research.deep_fit",
          objectType: "radar_item",
          objectId: place.itemId,
          metadata: { source: "chat_live_research", fit: taste.fit, score: taste.score },
        });
      }
    } catch (err) {
      console.error("[deepenResearch] failed", { itemId: place.itemId, err });
    }
  }
}
