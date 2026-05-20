import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/env";

// Provider-agnostic wrapper. All AI calls in Jarvis should go through
// /lib/ai so the underlying provider can change without touching callers.

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (client) return client;
  const env = getEnv();
  client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export const DEFAULT_MODEL = "claude-opus-4-7";
