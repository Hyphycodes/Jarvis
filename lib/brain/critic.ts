import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import type {
  BrainContextPacket,
  BrainDecision,
  ScoredItem,
} from "@/lib/brain/types";
import { RADAR_MIN_CONFIDENCE } from "@/lib/brain/constants";

const FALLBACK_HOLDING_CONFIDENCE_FLOOR = 0.45;

const SYSTEM_PROMPT = `You are Jarvis's CRITIC. You are the last line of defense before
items reach the founder. Your job is to reject anything that doesn't belong.

You MAY reject the entire selected list if it isn't good enough. An empty Radar
is correct when nothing clears the bar. Do not try to preserve the Curator's work
if it doesn't hold up.

REJECT if any of the following apply:
- Too generic: chain, hotel restaurant, tourist trap, mass-market venue.
- Weak evidence: a web article with no specific lead name; score bolstered by proximity alone.
- Wrong timing: all-day event on a Tuesday, event already past or too far out (> 3 weeks).
- Over-committed weekday: on Mon–Thu, reject items requiring high energy or long travel unless
  score is exceptional (> 0.80) and the founder's focus suggests an evening outing.
- Category oversaturation: if 3+ dining items are already selected, reject additional ones
  unless they are materially different in type or occasion.
- Confidence too low: any item with confidence < ${RADAR_MIN_CONFIDENCE} should be moved to
  discovered (not archived) unless it conflicts with a dealbreaker.
- Dealbreaker: anything matching the founder's explicit dealbreakers → "archived".

PRESERVE if:
- The item has a strong, specific venue name and clear evidence.
- Confidence >= ${RADAR_MIN_CONFIDENCE} and timing is right.
- It matches the founder's vibe and recent signals strongly.
- destination:"holding" selections are already reserved/quiet — leave them unless they
  violate a dealbreaker.

For rejected items:
- "archived": user should never see this again (dealbreaker, clearly wrong fit).
- "discovered": valid candidate that can resurface another day.

Return strict JSON matching BrainDecision. Preserve the shape: selected, rejected, notes.
Do not add items to selected that weren't in the Curator's output.`;

export async function runCritic(input: {
  context: BrainContextPacket;
  decision: BrainDecision;
  shortlist: ScoredItem[];
}): Promise<BrainDecision> {
  if (!hasAnthropic()) {
    // Deterministic fallback: apply confidence floor and category caps.
    console.warn("[brain.critic] using deterministic fallback", {
      reason: "ANTHROPIC_API_KEY missing",
    });
    return tightenSelections(input.decision);
  }

  const now = new Date(input.context.now);
  const isWeekday = now.getDay() >= 1 && now.getDay() <= 4;

  try {
    const prompt = JSON.stringify(
      {
        now: input.context.now,
        day_of_week: now.toLocaleDateString("en-US", { weekday: "long" }),
        is_weekday: isWeekday,
        founder_vibe: input.context.founder.vibeKeywords,
        founder_avoid: input.context.founder.avoidKeywords,
        dealbreakers: input.context.founder.dealbreakers,
        previous_decision: input.decision,
        shortlist_lookup: input.shortlist.map((s) => ({
          id: s.item.id,
          title: s.item.title,
          category: s.item.category,
          type: s.item.type,
          score: s.score,
          reasons: s.reasons,
          tags: s.item.tags,
          source: s.item.source,
          starts_at: s.item.startsAt,
        })),
        min_confidence: RADAR_MIN_CONFIDENCE,
        instructions: [
          "Reject items with confidence < " + RADAR_MIN_CONFIDENCE + " → suggestedStatus: 'discovered'.",
          "Reject dealbreaker matches → suggestedStatus: 'archived'.",
          "Returning selected:[] is correct if nothing clears the bar.",
          "Do NOT add new items to selected — only keep or move existing ones.",
        ],
      },
      null,
      2,
    );

    const result = await generateStructured<BrainDecision>({
      system: SYSTEM_PROMPT,
      prompt,
      schemaName: "BrainDecision",
    });

    return {
      selected: result.selected ?? input.decision.selected,
      rejected: result.rejected ?? input.decision.rejected,
      notes: [input.decision.notes, result.notes].filter(Boolean).join(" | "),
      fallbackUsed: input.decision.fallbackUsed,
      fallbackReason: input.decision.fallbackReason,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[brain.critic] structured generation failed", {
      reason,
      error,
    });
    return {
      ...tightenSelections(input.decision),
      fallbackUsed: true,
      fallbackReason: `critic error: ${reason}`,
    };
  }
}

/**
 * Deterministic fallback: apply the confidence floor from constants.
 * Items below RADAR_MIN_CONFIDENCE drop to "discovered" (stays in pool).
 */
function tightenSelections(decision: BrainDecision): BrainDecision {
  const selected = decision.selected.flatMap((s) => {
    if (s.confidence >= RADAR_MIN_CONFIDENCE) return [s];
    if (
      decision.fallbackUsed &&
      s.destination === "holding" &&
      s.confidence >= FALLBACK_HOLDING_CONFIDENCE_FLOOR
    ) {
      return [s];
    }
    return [];
  });
  const selectedIds = new Set(selected.map((s) => s.itemId));
  const dropped = decision.selected.filter((s) => !selectedIds.has(s.itemId));

  return {
    selected,
    rejected: [
      ...decision.rejected,
      ...dropped.map((s) => ({
        itemId: s.itemId,
        reason: `Critic deterministic cutoff: confidence ${s.confidence.toFixed(2)} < ${RADAR_MIN_CONFIDENCE}`,
        suggestedStatus: "discovered" as const,
      })),
    ],
    notes: dropped.length > 0
      ? `${decision.notes} | Dropped ${dropped.length} below confidence floor.`
      : decision.notes,
    fallbackUsed: decision.fallbackUsed,
    fallbackReason: decision.fallbackReason,
  };
}
