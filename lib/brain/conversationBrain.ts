import "server-only";

/**
 * Conversation Brain — Phase 5
 *
 * Split architecture (per Task 5.6):
 *   - This module owns the SYSTEM PROMPT and the `buildConversationMessages`
 *     prompt-renderer. It does NOT do the Claude call itself.
 *   - Streaming text → /api/voice/respond uses Anthropic SDK streaming mode.
 *   - Intent metadata → intentClassifier.ts runs in parallel (Task 5.7).
 *
 * The API route calls both in parallel, merges results into a single SSE stream.
 */

import { getSeasonalContext } from "@/lib/brain/seasonality";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { PlacesLibraryRow } from "@/lib/types/database";
import type { ConversationMessage } from "@/lib/brain/intentClassifier";

export type { ConversationMessage };

// ── System prompt ─────────────────────────────────────────────────────────────

export const CONVERSATION_SYSTEM_PROMPT = `You are Jarvis — the owner's private chief of staff and cultural advisor. You know Chicago deeply. You know the owner's taste, their inner circle, their rituals, their north star.

You are having a real conversation. Not processing a query. Not executing a command. Talking.

YOUR VOICE
- Calm, confident, masculine. Short sentences. No filler.
- You have opinions. You share them directly.
- You're not trying to impress. You're trying to be useful.
- You can be dry, even a little funny. Never try-hard.
- You don't hedge. You don't say "that's a great idea." You just respond.
- No bullet points in spoken responses. Write in flowing sentences.

RESPONSE LENGTH
- Explore (open-ended): 2-4 sentences. You're thinking together, not presenting.
- Consider (specific place or category): 3-5 sentences. You know something worth saying.
- Act (clear intent + specifics): Brief confirmation, then stop.

LIBRARY AWARENESS
When a specific place comes up that you know, use what you know — the verdict, best occasions, what makes it worth going. Don't pretend ignorance.

PEOPLE AWARENESS
You know the owner's inner circle. When a venue or occasion could connect to someone they care about, note it naturally — don't force it.

STAY IN TEXT
Your response is plain prose. No JSON, no markdown headers, no lists. Just what you'd say.`;

// ── Prompt builder ────────────────────────────────────────────────────────────

type BuildInput = {
  message: string;
  history: ConversationMessage[];
  context: BrainContextPacket;
  libraryEntries?: PlacesLibraryRow[];
};

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

export function buildConversationMessages(input: BuildInput): AnthropicMessage[] {
  const { message, history, context, libraryEntries = [] } = input;

  const seasonal = getSeasonalContext();

  // Build a context block injected as the first user turn (system supplement)
  const contextLines: string[] = [];

  contextLines.push(`Season: ${seasonal.season} (${seasonal.monthName}). ${seasonal.weatherPosture}.`);

  if (context.founder.vibeKeywords.length > 0) {
    contextLines.push(`Owner vibe: ${context.founder.vibeKeywords.slice(0, 6).join(", ")}.`);
  }
  if (context.founder.dealbreakers.length > 0) {
    contextLines.push(`Dealbreakers: ${context.founder.dealbreakers.slice(0, 4).join(", ")}.`);
  }

  if (context.people.length > 0) {
    const topPeople = context.people.slice(0, 5).map((p) =>
      `${p.name} (${p.relationship ?? p.category})`,
    );
    contextLines.push(`Inner circle: ${topPeople.join(", ")}.`);
  }

  if (libraryEntries.length > 0) {
    const entries = libraryEntries
      .slice(0, 6)
      .map((e) => `${e.name}: "${e.verdict ?? "No verdict yet."}"`)
      .join(" | ");
    contextLines.push(`Known places:\n${entries}`);
  }

  const contextBlock = contextLines.join("\n");

  // Build message array — last 8 turns max
  const recentHistory = history.slice(-8);

  const messages: AnthropicMessage[] = [];

  // Inject context as first user turn if we have it
  if (contextBlock) {
    messages.push({
      role: "user",
      content: `[Context for this conversation]\n${contextBlock}`,
    });
    messages.push({
      role: "assistant",
      content: "Got it.",
    });
  }

  // Previous turns
  for (const turn of recentHistory) {
    messages.push({
      role: turn.role === "user" ? "user" : "assistant",
      content: turn.content,
    });
  }

  // Current message
  messages.push({ role: "user", content: message });

  return messages;
}

// ── Library entry lookup by name (for named-place detection in route) ─────────

export function extractMentionedPlaceNames(
  message: string,
  history: ConversationMessage[],
): string[] {
  // Extract capitalized multi-word sequences that look like venue names
  // This is best-effort; false positives are OK — library lookup will just miss
  const allText = [
    ...history.slice(-4).map((m) => m.content),
    message,
  ].join(" ");

  const matches = allText.match(/\b[A-Z][a-zA-Z'&]+(?:\s+[A-Z][a-zA-Z'&]+){0,3}/g) ?? [];

  // Deduplicate, filter out common words
  const STOP = new Set(["I", "The", "A", "An", "It", "Is", "Are", "You", "We", "My", "In", "On", "At", "To", "And", "Or", "But", "Of", "For"]);
  const names = new Set<string>();
  for (const m of matches) {
    if (!STOP.has(m.trim()) && m.length > 3) names.add(m.trim());
  }
  return Array.from(names).slice(0, 5);
}
