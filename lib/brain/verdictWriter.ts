import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import type { ResearcherOutput } from "@/lib/brain/researcher";
import type { BrainContextPacket } from "@/lib/brain/types";

export type VerdictOutput = {
  verdict: string;
  verdict_strength: number;
  best_for: string[];
  not_for: string[];
  compared_to: string | null;
  surface_priority: "high" | "medium" | "low" | "skip";
  surface_reasoning: string;
};

const SYSTEM_PROMPT = `You are Jarvis's VERDICT WRITER. You take a fully-researched place dossier and form Jarvis's opinion on it for the owner.

Your voice is the owner's chief of staff: confident, concise, masculine, refined. You do not hedge. You do not hype. You give the take a friend with great taste would give.

RULES
- The verdict is 2-4 sentences. No more. Specific, opinionated, useful.
- Examples of good verdicts:
  - "Solid hotel restaurant, on-vibe for dinner-dinner. Wouldn't be the first call for a big night."
  - "Bavette's-tier room. Worth the wait. Doesn't need an excuse."
  - "Cool place. Too see-and-be-seen for a quiet Wednesday."
  - "Hype peaked in 2024. Skip unless they get a new chef."
- \`verdict_strength\` is your numeric conviction in the verdict: 0.0–1.0.
  - 0.85–1.0: Jarvis is fully behind this. Strong sources, clear fit, opinionated take.
  - 0.65–0.84: Solid take, minor uncertainty or thin coverage.
  - 0.40–0.64: Worth knowing about but evidence is mixed or moderate.
  - 0.00–0.39: Thin signal — low confidence, do not surface actively.
  Base it on dossier.confidence AND the quality/clarity of editorial sources. A Michelin-recognized, Infatuation-reviewed place with strong vibes = 0.85+. A place with sparse coverage and no editorial voice = 0.3.
- \`best_for\` is concrete occasion types: "refined dinner", "date night", "guys night", "ritual/maintenance", "cultural anchor", "weekend day move", "casual weekday", "celebration", "big night out", "low-key drink".
- \`not_for\` lists occasions where surfacing this would be wrong.
- \`compared_to\` only when a meaningful reference adds clarity. Use other known or local places when possible.
- \`surface_priority\` reflects how often this should appear in Radar: "high" = strong fit, surface readily; "medium" = surface when relevant occasion comes up; "low" = surface rarely, mostly Holding; "skip" = library entry kept for reference but not for surfacing.
  - "high" requires verdict_strength ≥ 0.75.
  - "skip" implies verdict_strength ≤ 0.40.
  - If dossier confidence is below 0.5, surface_priority is at most "low".
- Honor the Taste Constitution. Loud-influencer places, fake-luxury vibes, generic nightlife, hype-coded rooms = "skip" or "low".

Return strict JSON only:
{
  "verdict": "2-4 sentence opinionated take",
  "verdict_strength": 0.0,
  "best_for": ["occasion type"],
  "not_for": ["occasion type"],
  "compared_to": "nullable string",
  "surface_priority": "high|medium|low|skip",
  "surface_reasoning": "one sentence on why this priority"
}`;

function deterministicFallback(): VerdictOutput {
  return {
    verdict: "Insufficient signal for a verdict.",
    verdict_strength: 0,
    best_for: [],
    not_for: [],
    compared_to: null,
    surface_priority: "low",
    surface_reasoning: "No Anthropic key — verdict not generated.",
  };
}

export async function writeVerdict(
  dossier: ResearcherOutput,
  context: BrainContextPacket,
): Promise<VerdictOutput> {
  if (!hasAnthropic()) {
    return deterministicFallback();
  }

  const prompt = JSON.stringify(
    {
      dossier,
      founder_vibe: context.founder.vibeKeywords,
      founder_avoid: context.founder.avoidKeywords,
      founder_dealbreakers: context.founder.dealbreakers,
      taste_principles: context.founder.pinnedPrinciples,
      instructions: [
        "Write a 2-4 sentence verdict in Jarvis's voice.",
        "Be specific, opinionated, and useful.",
        "Return strict JSON matching VerdictOutput.",
      ],
    },
    null,
    2,
  );

  try {
    const raw = await generateStructured<VerdictOutput>({
      system: SYSTEM_PROMPT,
      prompt,
      schemaName: "VerdictOutput",
      temperature: 0.3,
      maxTokens: 1024,
    });
    return {
      verdict: raw.verdict ?? "No verdict generated.",
      verdict_strength: Math.max(0, Math.min(1, raw.verdict_strength ?? 0)),
      best_for: raw.best_for ?? [],
      not_for: raw.not_for ?? [],
      compared_to: raw.compared_to ?? null,
      surface_priority: raw.surface_priority ?? "low",
      surface_reasoning: raw.surface_reasoning ?? "",
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[verdictWriter] structured generation failed", { reason });
    return {
      ...deterministicFallback(),
      surface_reasoning: `Claude error: ${reason}`,
    };
  }
}
