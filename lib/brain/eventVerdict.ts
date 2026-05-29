import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { CurrentEventRow, PlacesLibraryRow } from "@/lib/types/database";
import type { OccasionType } from "@/lib/brain/occasionTypes";

// ── Types ────────────────────────────────────────────────────────────────────

export type EventVerdictOutput = {
  verdict: string;
  verdict_strength: number;
  recommended_action: "surface_radar" | "hold" | "reject";
  occasion_type?: OccasionType;
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Jarvis's EVENT VERDICT WRITER. You write Jarvis's take on whether a specific upcoming event in Chicago is worth the owner's attention.

Your voice is the owner's chief of staff. Confident, concise, opinionated.

RULES
- 2-4 sentences max.
- Frame it as: what is this event, why it's interesting (or not), should they go.
- If the event is at a library-known venue, anchor your verdict in the venue's existing verdict. If the venue is "skip" tier, the event probably is too unless the named artist is exceptional.
- Examples:
  - "DJ Tennis at Sleeping Village Saturday. Real artist, intimate room, will sell out. The move."
  - "Wine dinner at Cira Tuesday. Hotel restaurant we like, sommelier hosting. Solid weeknight option."
  - "Some open-format DJ at a bottle service spot in River North. Skip."
  - "Yacht rock cover band Friday. Pass unless there's a specific reason."
- \`verdict_strength\` 0.7+ means surface to Active Radar. 0.4–0.7 means Holding. Below 0.4 means reject.
  Base it on: named artist/chef credibility + venue tier + specificity of the event + fit with owner taste.
- \`recommended_action\` must match: 0.7+ → "surface_radar", 0.4–0.7 → "hold", below 0.4 → "reject".

Return strict JSON only:
{
  "verdict": "2-4 sentence opinionated take",
  "verdict_strength": 0.0,
  "recommended_action": "surface_radar" | "hold" | "reject",
  "occasion_type": "refined_dinner|casual_hang|big_night_out|ritual_maintenance|cultural_anchor|date_night|guys_night|weekday_after_work|weekend_day_move|weekend_night_move|family_time|creative_session"
}`;

// ── Fallback ──────────────────────────────────────────────────────────────────

function deterministicFallback(): EventVerdictOutput {
  return {
    verdict: "Insufficient signal for a verdict.",
    verdict_strength: 0,
    recommended_action: "reject",
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function writeEventVerdict(
  event: CurrentEventRow,
  libraryEntry: PlacesLibraryRow | null,
  context: BrainContextPacket,
): Promise<EventVerdictOutput> {
  if (!hasAnthropic()) return deterministicFallback();

  const prompt = JSON.stringify(
    {
      event: {
        title: event.title,
        event_type: event.event_type,
        venue_name: event.venue_name,
        named_entities: event.named_entities,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        description: event.description,
        vibe_keywords: event.vibe_keywords,
        ticket_url: event.ticket_url,
      },
      venue_known: libraryEntry !== null,
      venue_verdict: libraryEntry?.verdict ?? null,
      venue_verdict_strength: libraryEntry?.verdict_strength ?? null,
      venue_surface_priority: null, // not stored in schema yet
      founder_vibe: context.founder.vibeKeywords,
      founder_avoid: context.founder.avoidKeywords,
      founder_dealbreakers: context.founder.dealbreakers,
      taste_principles: context.founder.pinnedPrinciples,
      instructions: [
        "Write a 2-4 sentence event verdict in Jarvis's voice.",
        "Be specific and opinionated. Do not hedge.",
        "Return strict JSON matching EventVerdictOutput.",
      ],
    },
    null,
    2,
  );

  try {
    const raw = await generateStructured<EventVerdictOutput>({
      system: SYSTEM_PROMPT,
      prompt,
      schemaName: "EventVerdictOutput",
      temperature: 0.3,
      maxTokens: 512,
    });

    const strength = Math.max(0, Math.min(1, raw.verdict_strength ?? 0));
    const action: EventVerdictOutput["recommended_action"] =
      strength >= 0.7
        ? "surface_radar"
        : strength >= 0.4
          ? "hold"
          : "reject";

    return {
      verdict: raw.verdict ?? "No verdict generated.",
      verdict_strength: strength,
      recommended_action: action,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[eventVerdict] failed", { event: event.title, reason });
    return {
      ...deterministicFallback(),
      verdict: `Could not generate verdict: ${reason}`,
    };
  }
}
