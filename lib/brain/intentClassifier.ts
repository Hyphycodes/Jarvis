import "server-only";

import { hasAnthropic, getAnthropicClient, DEFAULT_MODEL } from "@/lib/ai/anthropic";

// ── Types ────────────────────────────────────────────────────────────────────

export type ConversationMessage = {
  role: "user" | "jarvis";
  content: string;
};

export type IntentResult = {
  intent: "explore" | "consider" | "act";
  ask_about_plan: boolean;
  plan_context: {
    place_name: string | null;
    date_hint: string | null;
    occasion_type: string | null;
  } | null;
};

// ── System prompt (kept minimal for speed) ────────────────────────────────────

const SYSTEM = `Classify the intent of this message in a conversation with a lifestyle AI. Return JSON only:
{ "intent": "explore" | "consider" | "act", "ask_about_plan": boolean, "plan_context": { "place_name": string|null, "date_hint": string|null, "occasion_type": string|null } | null }
- explore: vague, open-ended, no specific place or time
- consider: specific category or place, no firm commitment
- act: named place + timeframe, explicit readiness to commit
- ask_about_plan: true only when a specific place AND timeframe are both established. Never true on the first message.`;

// ── Fallback ──────────────────────────────────────────────────────────────────

const FALLBACK: IntentResult = {
  intent: "explore",
  ask_about_plan: false,
  plan_context: null,
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function classifyIntent(
  message: string,
  history: ConversationMessage[],
): Promise<IntentResult> {
  if (!hasAnthropic()) return FALLBACK;

  // Build a compact history string (last 6 turns max)
  const recentHistory = history.slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Jarvis"}: ${m.content}`)
    .join("\n");

  const prompt = recentHistory
    ? `Conversation so far:\n${recentHistory}\n\nLatest message: ${message}`
    : `First message: ${message}`;

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 100,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(raw) as Partial<IntentResult>;
    return {
      intent: parsed.intent ?? "explore",
      ask_about_plan: parsed.ask_about_plan ?? false,
      plan_context: parsed.plan_context ?? null,
    };
  } catch (err) {
    console.warn("[intentClassifier] failed", err);
    return FALLBACK;
  }
}
