import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/types/database";

/**
 * Settings → Signal OS bridge. The Private Layer is the *declared context*
 * input: a meaningful settings change emits a structured signal so learned
 * context downstream can weigh it.
 *
 * Deliberately SEPARATE from `recordBehaviorSignal` ([[behaviorSignals.ts]]),
 * which is coupled to the memory-proposal path and a closed signal union. This
 * is a thin, best-effort writer into the same `behavior_signals` table — it
 * NEVER throws, so a settings save never depends on the signal landing
 * (guardrail). The caller passes its existing client + owner id (no redundant
 * auth round-trip).
 */
export type SettingsSignal = {
  /** Event name → behavior_signals.signal_type, e.g. "settings.spend.updated". */
  event: string;
  domain: "money" | "rhythm" | "general" | "identity";
  /** Where it came from, e.g. "settings.spend". */
  source: string;
  trait?: string;
  polarity?: "positive" | "negative" | "contextual";
  /** Structured detail of what changed. */
  payload?: Record<string, unknown>;
};

export async function recordSettingsSignal(
  supabase: SupabaseClient,
  userId: string,
  signal: SettingsSignal,
): Promise<void> {
  try {
    await supabase.from("behavior_signals").insert({
      user_id: userId,
      signal_type: signal.event,
      object_type: "settings",
      object_id: null,
      metadata: {
        domain: signal.domain,
        source: signal.source,
        trait: signal.trait ?? null,
        polarity: signal.polarity ?? "contextual",
        signal_kind: "declared_context",
        confidence: 1,
        strength: 1,
      } as Json,
      payload: {
        ...(signal.payload ?? {}),
        event: signal.event,
        source: signal.source,
      } as Json,
    });
  } catch (err) {
    // Best-effort only — a failed signal must never break a settings save.
    console.warn("[settings.signal] best-effort write failed", {
      event: signal.event,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
