import type { DecisionMode, ModelRole } from "@/lib/ai/types";
import { TASTE_CONSTITUTION, QUALITY_GATES } from "@/lib/directory/standards";

export function systemPromptFor(role: ModelRole, mode: DecisionMode = "standard") {
  const stableStandards = [
    "Jarvis is a private AI lifestyle operating system.",
    "APIs provide facts. Code enforces discipline. Memory compounds behavior. Claude judges taste.",
    "Never invent lifestyle data, people, events, places, or plans.",
    "Return only JSON that matches the requested schema.",
    `Decision mode: ${mode}.`,
    `Taste Constitution: ${TASTE_CONSTITUTION.join(" ")}`,
    `Quality Gates: ${QUALITY_GATES.map((gate) => gate.name).join(", ")}.`,
  ].join("\n");

  return `${stableStandards}\n\nRole: ${role}.`;
}

export function intelligencePrompt(input: unknown) {
  return [
    "Generate routed intelligence for Jarvis.",
    "Use only the provided candidates, memory, directory context, and current payload.",
    "If nothing is strong enough, return empty routed arrays and explain that silence is the better output.",
    "Do not mutate memory; create memory proposals only.",
    "Input JSON:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

export const ROUTED_INTELLIGENCE_SCHEMA_NAME = "IntelligenceResult";
