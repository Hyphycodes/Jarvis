import "server-only";

import type { ConversationMessage } from "@/lib/brain/intentClassifier";
import type { ChatAttachment, ChatChip, ChatIntent } from "@/lib/chat/types";

export type RoutedChatIntent = {
  intent: ChatIntent;
  recognitionMode: boolean;
  commitmentMode: boolean;
  dbWritesAllowed: "none" | "observe" | "light" | "confirmed";
  researchNeeded: boolean;
  chips: ChatChip[];
};

const COMMITMENT_RE = /\b(plan it|build plan|book it|let'?s do it|make this happen|add (it|this) to (my )?calendar|build the night|yes,? build|yes build|commit)\b/i;
const CANCEL_RE = /\b(stop planning|cancel planning|don't plan|do not plan|nevermind|never mind|stop that)\b/i;

export function routeChatIntent(input: {
  message: string;
  attachments?: ChatAttachment[];
  history?: ConversationMessage[];
}): RoutedChatIntent {
  const message = input.message.trim();
  const lower = message.toLowerCase();
  const hasImage = input.attachments?.some((a) => a.type === "image") ?? false;
  const commitmentMode = COMMITMENT_RE.test(message);

  if (hasImage) {
    return {
      intent: "image_drop",
      recognitionMode: !commitmentMode,
      commitmentMode,
      dbWritesAllowed: commitmentMode ? "confirmed" : "light",
      researchNeeded: true,
      chips: [],
    };
  }

  if (CANCEL_RE.test(message)) {
    return {
      intent: "plan",
      recognitionMode: false,
      commitmentMode: false,
      dbWritesAllowed: "confirmed",
      researchNeeded: false,
      chips: [],
    };
  }

  if (commitmentMode) {
    return {
      intent: "plan",
      recognitionMode: false,
      commitmentMode: true,
      dbWritesAllowed: "confirmed",
      researchNeeded: true,
      chips: [],
    };
  }

  if (/\b(save|keep|put).{0,24}\b(radar|maybe|holding)\b/i.test(message)) {
    return {
      intent: "create_radar_item",
      recognitionMode: true,
      commitmentMode: false,
      dbWritesAllowed: "light",
      researchNeeded: true,
      chips: [],
    };
  }

  if (/\b(not my vibe|bad fit|too basic|too touristy|too loud|hate|pass on|skip)\b/i.test(lower)) {
    return {
      intent: "taste_feedback",
      recognitionMode: true,
      commitmentMode: false,
      dbWritesAllowed: "observe",
      researchNeeded: false,
      chips: [],
    };
  }

  if (/\b(remember|note this|save this preference|i like|i dislike|i hate|i love)\b/i.test(lower)) {
    return {
      intent: "add_memory",
      recognitionMode: true,
      commitmentMode: false,
      dbWritesAllowed: "observe",
      researchNeeded: false,
      chips: [],
    };
  }

  if (/\b(source|instagram|newsletter|account|creator|tastemaker|monitor)\b/i.test(lower)) {
    return {
      intent: "source_learning",
      recognitionMode: true,
      commitmentMode: false,
      dbWritesAllowed: "observe",
      researchNeeded: true,
      chips: [],
    };
  }

  if (/\b(circle|marco|alex|lucia|friend|people|person)\b/i.test(lower)) {
    return {
      intent: "circle_question",
      recognitionMode: true,
      commitmentMode: false,
      dbWritesAllowed: "none",
      researchNeeded: false,
      chips: [],
    };
  }

  if (/\b(should i|which one|decide|better move|worth it|is this)\b/i.test(lower)) {
    return {
      intent: "decide",
      recognitionMode: true,
      commitmentMode: false,
      dbWritesAllowed: "none",
      researchNeeded: true,
      chips: [],
    };
  }

  return {
    intent: "ask",
    recognitionMode: true,
    commitmentMode: false,
    dbWritesAllowed: "none",
    researchNeeded: false,
    chips: [],
  };
}
