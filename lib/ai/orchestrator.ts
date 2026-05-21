import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  intelligencePrompt,
  ROUTED_INTELLIGENCE_SCHEMA_NAME,
  systemPromptFor,
} from "@/lib/ai/prompts";
import { generateStructured } from "@/lib/ai/structured";
import type {
  DecisionMode,
  IntelligenceInput,
  IntelligenceResult,
  RoutedIntelligence,
} from "@/lib/ai/types";
import { loadDirectoryContext } from "@/lib/directory/profile";
import { listActiveMemory } from "@/lib/memory/memoryStore";
import { memoryUpdateProposalSchema, routedIntelligenceSchema } from "@/lib/schemas";

const intelligenceResultSchema = z.object({
  routed: z.array(routedIntelligenceSchema),
  memoryProposals: z.array(memoryUpdateProposalSchema),
  explanation: z.string(),
});

export async function generateIntelligence(
  input: IntelligenceInput,
): Promise<IntelligenceResult> {
  const decisionMode = input.decisionMode ?? chooseDecisionMode(input);
  const memory = input.memory ?? (await listActiveMemory().catch(() => []));
  const directoryContext =
    input.directoryContext ?? (await loadDirectoryContext().catch(() => null));

  const modelInput = {
    ...input,
    decisionMode,
    memory,
    directoryContext,
  };

  const empty = emptyIntelligenceResult(
    "No candidates or user request were strong enough to route.",
  );

  if (!input.userMessage && (!input.candidates || input.candidates.length === 0)) {
    return empty;
  }

  const raw = await generateStructured<unknown>({
    system: systemPromptFor("director", decisionMode),
    prompt: intelligencePrompt(modelInput),
    schemaName: ROUTED_INTELLIGENCE_SCHEMA_NAME,
    temperature: decisionMode === "director_cut" ? 0.35 : 0.2,
  });

  const parsed = intelligenceResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid intelligence result: ${parsed.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  return parsed.data as IntelligenceResult;
}

export function chooseDecisionMode(input: IntelligenceInput): DecisionMode {
  const text = input.userMessage?.toLowerCase() ?? "";
  if (text.includes("make it perfect") || text.includes("think deeply")) {
    return "director_cut";
  }
  if (
    text.includes("weekend") ||
    text.includes("date night") ||
    text.includes("whole night")
  ) {
    return "deep";
  }
  if (!input.userMessage && input.candidates?.length) return "standard";
  return "standard";
}

export function emptyIntelligenceResult(explanation: string): IntelligenceResult {
  return {
    routed: [],
    memoryProposals: [],
    explanation,
  };
}

export function systemRoutedIntelligence<TPayload>(
  destination: RoutedIntelligence<TPayload>["destination"],
  payload: TPayload,
  reason: string,
): RoutedIntelligence<TPayload> {
  return {
    id: randomUUID(),
    destination,
    priority: 0,
    confidence: 1,
    payload,
    reason,
    source: "system",
    createdAt: new Date().toISOString(),
  };
}
