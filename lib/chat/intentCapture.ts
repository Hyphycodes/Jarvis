import "server-only";

import { hasAnthropic } from "@/lib/ai/anthropic";
import { generateStructured } from "@/lib/ai/structured";
import { normalizeRadarCategory, type RadarCategory } from "@/lib/radar/category";
import { looksActionable } from "@/lib/chat/actionableGate";
import type { ConversationMessage } from "@/lib/brain/intentClassifier";

export { looksActionable };

export type ActionableIntent = {
  title: string;
  category: RadarCategory | null;
  kind: "place" | "event" | "style" | null;
  dateHint: string | null;
  note: string;
};

const SYSTEM = `You detect whether a message is the owner expressing an ACTIONABLE intent to do/try/get a SPECIFIC, NAMED thing — a place to go, an event to attend, or a product to buy — vs. just chatting or asking a question.

Return strict JSON:
{ "actionable": boolean, "title": string|null, "category": "moves"|"events"|"culture"|"dining"|"places"|"style"|null, "kind": "place"|"event"|"style"|null, "date_hint": string|null, "note": string|null }

Rules:
- actionable=true ONLY when there is a specific, named subject to act on (e.g. "I want to try Pizz'Amici next week"). Vague exploration ("what's good this weekend?", "any ideas?") is actionable=false.
- title: the proper name of the place/event/product, cleaned. null if there is no specific name.
- category: the single best Radar category.
- kind: "place" for venues/restaurants/bars/activities, "event" for ticketed/timed happenings, "style" for products to buy.
- date_hint: any timing the owner mentioned, verbatim ("next week", "Friday night"); else null. NEVER invent a date.
- note: a one-line restatement of the ask for research context.`;

type RawExtraction = {
  actionable?: boolean;
  title?: string | null;
  category?: string | null;
  kind?: string | null;
  date_hint?: string | null;
  note?: string | null;
};

export async function extractActionableIntent(
  message: string,
  history: ConversationMessage[] = [],
): Promise<ActionableIntent | null> {
  if (!hasAnthropic()) return null;
  const recent = history
    .slice(-4)
    .map((m) => `${m.role === "user" ? "User" : "Jarvis"}: ${m.content}`)
    .join("\n");
  try {
    const out = await generateStructured<RawExtraction>({
      system: SYSTEM,
      prompt: recent ? `Conversation:\n${recent}\n\nLatest: ${message}` : `Message: ${message}`,
      schemaName: "ActionableIntent",
      temperature: 0,
      maxTokens: 400,
    });
    const title = typeof out.title === "string" ? out.title.trim() : "";
    if (!out.actionable || !title) return null;
    return {
      title,
      category: normalizeRadarCategory(out.category),
      kind: out.kind === "place" || out.kind === "event" || out.kind === "style" ? out.kind : null,
      dateHint: typeof out.date_hint === "string" && out.date_hint.trim() ? out.date_hint.trim() : null,
      note: typeof out.note === "string" && out.note.trim() ? out.note.trim() : message,
    };
  } catch {
    return null;
  }
}
