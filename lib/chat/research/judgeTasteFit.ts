import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import type { ChatContextPacket } from "@/lib/chat/context/types";
import type {
  ImageAnalysisResult,
  ResearchSubjectResult,
  TasteFitJudgment,
} from "@/lib/chat/types";

const SYSTEM_PROMPT = `You are Jarvis's taste-fit judge. Research popularity is not enough.

Decide whether the subject is actually for the owner, given known taste, constraints, recent signals, and current commitments.

Return strict JSON:
{
  "fit": "strong" | "medium" | "weak" | "bad",
  "score": number between 0 and 1,
  "summary": string,
  "role": "radar_item" | "source" | "full_plan_candidate" | "maybe" | "pass",
  "cautions": string[]
}`;

export async function judgeTasteFit(input: {
  context: ChatContextPacket;
  analysis?: ImageAnalysisResult;
  research?: ResearchSubjectResult | null;
}): Promise<TasteFitJudgment> {
  if (!hasAnthropic()) return deterministicJudgment(input);

  try {
    const result = await generateStructured<TasteFitJudgment>({
      system: SYSTEM_PROMPT,
      schemaName: "TasteFitJudgment",
      temperature: 0.15,
      maxTokens: 700,
      prompt: JSON.stringify({
        owner_taste: {
          vibe: input.context.user.vibeKeywords,
          avoid: input.context.user.avoidKeywords,
          dealbreakers: input.context.user.dealbreakers,
          principles: input.context.user.pinnedPrinciples,
          current_focus: input.context.user.currentFocus,
        },
        constraints: input.context.constraints,
        recent_signals: input.context.recentSignals.slice(0, 12),
        radar: input.context.radar.slice(0, 8),
        analysis: input.analysis ?? null,
        research: input.research ?? null,
        instruction:
          "Judge fit. Do not convert to full plan unless there is explicit user commitment; this is just intake.",
      }),
    });
    return normalizeJudgment(result);
  } catch (error) {
    console.error("[chat.judgeTasteFit] failed", error);
    return deterministicJudgment(input);
  }
}

function deterministicJudgment(input: {
  context: ChatContextPacket;
  analysis?: ImageAnalysisResult;
  research?: ResearchSubjectResult | null;
}): TasteFitJudgment {
  const haystack = [
    input.analysis?.extracted.vibe_description,
    input.analysis?.extracted.cuisine_or_category,
    input.analysis?.extracted.raw_text,
    input.research?.summary,
  ].filter(Boolean).join(" ").toLowerCase();

  const positiveHits = input.context.user.vibeKeywords.filter((v) =>
    haystack.includes(v.toLowerCase()),
  ).length;
  const avoidHits = [...input.context.user.avoidKeywords, ...input.context.user.dealbreakers].filter((v) =>
    haystack.includes(v.toLowerCase()),
  ).length;
  const base =
    input.analysis?.confidence === "high" ? 0.68 :
    input.analysis?.confidence === "medium" ? 0.55 :
    0.38;
  const score = Math.max(0, Math.min(1, base + positiveHits * 0.08 - avoidHits * 0.15));

  if (score >= 0.74) {
    return {
      fit: "strong",
      score,
      summary: "Strong enough for Radar, but still recognition-first.",
      role: "radar_item",
      cautions: avoidHits ? ["Watch the avoid-signal overlap."] : [],
    };
  }
  if (score >= 0.52) {
    return {
      fit: "medium",
      score,
      summary: "Interesting maybe. Save the observation and wait for a stronger move.",
      role: "maybe",
      cautions: [],
    };
  }
  return {
    fit: avoidHits ? "bad" : "weak",
    score,
    summary: avoidHits ? "Probably off-vibe." : "Too thin to act on yet.",
    role: "pass",
    cautions: avoidHits ? ["Conflicts with known avoid signals."] : ["Low evidence."],
  };
}

function normalizeJudgment(input: TasteFitJudgment): TasteFitJudgment {
  const fit = ["strong", "medium", "weak", "bad"].includes(input.fit)
    ? input.fit
    : "weak";
  const role = ["radar_item", "source", "full_plan_candidate", "maybe", "pass"].includes(input.role)
    ? input.role
    : "maybe";
  const score = typeof input.score === "number" && Number.isFinite(input.score)
    ? Math.max(0, Math.min(1, input.score))
    : fit === "strong" ? 0.8 : fit === "medium" ? 0.6 : 0.35;
  return {
    fit,
    role,
    score,
    summary: input.summary?.trim() || "Taste fit judged from current context.",
    cautions: Array.isArray(input.cautions) ? input.cautions.slice(0, 5) : [],
  };
}
