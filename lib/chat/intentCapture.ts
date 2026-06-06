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
  kind: "place" | "event" | "style" | "finds" | null;
  dateHint: string | null;
  note: string;
};

const SYSTEM = `You detect whether a message is the owner expressing an ACTIONABLE intent to do/try/get a SPECIFIC, NAMED thing — a place to go, an event to attend, or a product to buy — vs. just chatting or asking a question.

Return strict JSON:
{ "actionable": boolean, "title": string|null, "category": "moves"|"events"|"culture"|"dining"|"places"|"style"|null, "kind": "place"|"event"|"style"|null, "date_hint": string|null, "note": string|null }

Rules:
- actionable=true when there is a specific intent to act on — either a NAMED place/event ("try Pizz'Amici next week") OR a thing to acquire ("I need linen shirts", "find me a better camera bag"). Vague exploration ("what's good this weekend?") is actionable=false.
- title: the named place/event, OR for a purchase the concise mission ("linen shirts for summer", "better camera bag"). null if nothing specific.
- kind:
  - "place" for venues/restaurants/bars/activities to GO to,
  - "event" for ticketed/timed happenings to attend,
  - "finds" for anything to BUY / source / upgrade / replace / carry / install / gift — clothing, accessories, gear, grooming, travel, home/storage, tech, products.
- category: best Radar category for place/event/style; for "finds" use null.
- date_hint: any timing the owner mentioned, verbatim; else null. NEVER invent a date.
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
      kind:
        out.kind === "place" || out.kind === "event" || out.kind === "style" || out.kind === "finds"
          ? out.kind
          : null,
      dateHint: typeof out.date_hint === "string" && out.date_hint.trim() ? out.date_hint.trim() : null,
      note: typeof out.note === "string" && out.note.trim() ? out.note.trim() : message,
    };
  } catch {
    return null;
  }
}
