// Pure, unit-testable gate (no server-only / IO) so we only spend an LLM
// extraction call on messages that read like the owner wanting to do/try/get a
// specific thing.

const ACTIONABLE_RE =
  /\b(i (?:want|wanna|need|'?d like|would like) to|let'?s (?:try|go|hit|check out|do)|take me to|book|reserve|i should (?:try|go|check)|thinking (?:about|of) (?:going|trying)|add .*\b(?:radar|list|calendar)\b|put .* on (?:my )?radar|check out|try out)\b/i;

export function looksActionable(message: string): boolean {
  const m = message.trim();
  if (m.length < 4) return false;
  return ACTIONABLE_RE.test(m);
}
