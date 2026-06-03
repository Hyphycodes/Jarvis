import "server-only";

import { createObservation } from "@/lib/chat/observations";
import type { ChatIntent, ChatIntakeResult } from "@/lib/chat/types";

const OBSERVE_INTENTS = new Set<ChatIntent>([
  "add_memory",
  "create_radar_item",
  "taste_feedback",
  "source_learning",
  "voice_transcription",
]);

export async function handleTextObservation(input: {
  userId: string;
  message: string;
  intent: ChatIntent;
}): Promise<ChatIntakeResult | null> {
  if (!OBSERVE_INTENTS.has(input.intent)) return null;
  const observation = await createObservation({
    userId: input.userId,
    sourceType: "text",
    extractedText: input.message,
    interpretedType: input.intent,
    confidence: 0.55,
    state: "observed",
    metadata: {
      intent: input.intent,
      recognition_mode: true,
    },
  });

  return {
    observationId: observation.id,
    contextBlock: `Text observation saved (${input.intent}). Do not treat it as a commitment unless the user explicitly asks to act.`,
    chips:
      input.intent === "taste_feedback"
        ? [
            {
              label: "Noted",
              message: "Noted.",
              action_type: "dismiss",
              payload: { observation_id: observation.id },
            },
          ]
        : [],
    state: "observed",
  };
}
