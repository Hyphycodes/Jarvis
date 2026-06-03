import type { NorthAlignment } from "@/lib/context/types";

export type IntelligenceReason = {
  summary: string;
  contextFactors: string[];
  northAlignment?: NorthAlignment;
  behaviorInfluence?: string[];
  circleInfluence?: string[];
  memoryInfluence?: string[];
  timingReason?: string;
  sourceStrength?: "weak" | "medium" | "strong";
  confidence?: number;
};

export type IntelligenceReasonInput = {
  summary?: string | null;
  contextFactors?: Array<string | null | undefined>;
  northAlignment?: NorthAlignment | null;
  behaviorInfluence?: Array<string | null | undefined>;
  circleInfluence?: Array<string | null | undefined>;
  memoryInfluence?: Array<string | null | undefined>;
  timingReason?: string | null;
  sourceStrength?: IntelligenceReason["sourceStrength"] | null;
  confidence?: number | null;
};

export function buildIntelligenceReason(
  input: IntelligenceReasonInput,
): IntelligenceReason {
  const contextFactors = cleanList(input.contextFactors);
  const behaviorInfluence = cleanList(input.behaviorInfluence);
  const circleInfluence = cleanList(input.circleInfluence);
  const memoryInfluence = cleanList(input.memoryInfluence);
  const northAlignment =
    input.northAlignment && input.northAlignment.score > 0
      ? input.northAlignment
      : undefined;
  const summary =
    cleanText(input.summary) ??
    firstDefined([
      northAlignment?.reason,
      contextFactors[0],
      behaviorInfluence[0],
      circleInfluence[0],
      memoryInfluence[0],
      input.timingReason,
      "Decision based on current Jarvis context.",
    ]);

  return {
    summary,
    contextFactors,
    ...(northAlignment ? { northAlignment } : {}),
    ...(behaviorInfluence.length > 0 ? { behaviorInfluence } : {}),
    ...(circleInfluence.length > 0 ? { circleInfluence } : {}),
    ...(memoryInfluence.length > 0 ? { memoryInfluence } : {}),
    ...(input.timingReason ? { timingReason: input.timingReason } : {}),
    ...(input.sourceStrength ? { sourceStrength: input.sourceStrength } : {}),
    ...(typeof input.confidence === "number"
      ? { confidence: clamp01(input.confidence) }
      : {}),
  };
}

export function reasonForCircleMoment(input: {
  title: string;
  suggestedAction?: string | null;
  urgency?: string | null;
}): IntelligenceReason {
  const urgency = input.urgency ? ` (${input.urgency})` : "";
  const summary = input.suggestedAction
    ? `Circle: ${input.title}${urgency} — ${input.suggestedAction}`
    : `Circle: ${input.title}${urgency}`;
  return buildIntelligenceReason({
    summary,
    contextFactors: [input.title],
    circleInfluence: [input.suggestedAction ?? input.title],
    confidence: input.urgency?.toLowerCase() === "urgent" ? 0.82 : 0.68,
  });
}

export function sourceStrengthFromConfidence(
  confidence?: number | null,
): IntelligenceReason["sourceStrength"] | undefined {
  if (typeof confidence !== "number") return undefined;
  if (confidence >= 0.72) return "strong";
  if (confidence >= 0.5) return "medium";
  return "weak";
}

function cleanList(values: Array<string | null | undefined> | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map(cleanText).filter((value): value is string => Boolean(value))),
  ).slice(0, 8);
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

function firstDefined(values: Array<string | null | undefined>): string {
  return values.find((value): value is string => Boolean(cleanText(value))) ??
    "Decision based on current Jarvis context.";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
