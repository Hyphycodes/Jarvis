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
const SAVE_CURRENT_RE = /\b(save|keep|hold onto|bookmark)\s+(this|it)\b/i;
const PASS_CURRENT_RE = /\b(pass|skip|dismiss|archive)\s+(on\s+)?(this|it)\b|don'?t show me this kind/i;
const REMEMBER_RE = /\b(remember|note this|save this preference|make this part of north|add this to north)\b/i;

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

  if (SAVE_CURRENT_RE.test(message) || /\b(save|keep|put).{0,24}\b(radar|maybe|holding)\b/i.test(message)) {
    return {
      intent: "create_radar_item",
      recognitionMode: true,
      commitmentMode: false,
      dbWritesAllowed: "light",
      researchNeeded: true,
      chips: [],
    };
  }

  if (PASS_CURRENT_RE.test(message) || /\b(not my vibe|bad fit|too basic|too touristy|too loud|hate|pass on|skip)\b/i.test(lower)) {
    return {
      intent: "taste_feedback",
      recognitionMode: true,
      commitmentMode: false,
      dbWritesAllowed: "observe",
      researchNeeded: false,
      chips: [],
    };
  }

  if (REMEMBER_RE.test(message) || /\b(i like|i dislike|i hate|i love)\b/i.test(lower)) {
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

  if (/\b(should i|which one|decide|better move|worth it|is this|what should i do|after work|tonight)\b/i.test(lower)) {
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

export function buildCommandActionChips(input: {
  message: string;
  sheetContext?: string;
}): ChatChip[] {
  const message = input.message.trim();
  const itemId = readCurrentItemId(input.sheetContext);
  const chips: ChatChip[] = [];

  if (itemId && SAVE_CURRENT_RE.test(message)) {
    chips.push({
      label: "Save Item",
      message: "Save this.",
      action_type: "save_item",
      payload: { item_id: itemId, origin: "voice" },
    });
  }

  if (itemId && PASS_CURRENT_RE.test(message)) {
    chips.push({
      label: "Pass",
      message: "Pass on this.",
      action_type: "pass_item",
      payload: { item_id: itemId, origin: "voice" },
    });
  }

  if (itemId && COMMITMENT_RE.test(message)) {
    chips.push({
      label: "Plan It",
      message: "Plan this.",
      action_type: "build_plan",
      payload: { item_id: itemId, origin: "voice" },
    });
  }

  if (REMEMBER_RE.test(message)) {
    const north = /\bnorth\b/i.test(message);
    const content = extractMemoryContent(message, input.sheetContext);
    if (content) {
      chips.push({
        label: north ? "Save to North" : "Remember",
        message: north ? "Save this to North." : "Remember this.",
        action_type: "remember",
        payload: {
          memory_content: content,
          memory_type: north ? "north_goal" : "confirmed_behavior",
          item_id: itemId ?? null,
          origin: "voice",
        },
      });
    }
  }

  return chips.slice(0, 4);
}

function readCurrentItemId(sheetContext: string | undefined): string | null {
  if (!sheetContext) return null;
  const match = sheetContext.match(/Current item id:\s*([a-zA-Z0-9-]+)/);
  return match?.[1] ?? null;
}

function extractMemoryContent(message: string, sheetContext: string | undefined): string | null {
  const cleaned = message
    .replace(/\b(remember|note this|save this preference|make this part of north|add this to north)\b[:\s-]*/i, "")
    .trim();
  if (cleaned.length >= 6) return cleaned.slice(0, 500);
  const visible = sheetContext?.match(/User is on (?:the detail page for|an item detail page\.)([^.]+)/i)?.[1]?.trim();
  return visible && visible.length >= 6 ? visible.slice(0, 500) : null;
}
