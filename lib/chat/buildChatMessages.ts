import "server-only";

import type { ConversationMessage } from "@/lib/brain/intentClassifier";

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

export function buildChatMessages(input: {
  message: string;
  history: ConversationMessage[];
  intakeContext?: string | null;
}): AnthropicMessage[] {
  const messages: AnthropicMessage[] = input.history.slice(-10).map((turn) => ({
    role: turn.role === "jarvis" ? "assistant" : "user",
    content: turn.content,
  }));

  const content = input.intakeContext
    ? `[MESSAGE INTAKE]\n${input.intakeContext}\n\n[USER MESSAGE]\n${input.message}`
    : input.message;

  messages.push({ role: "user", content });
  return messages;
}
