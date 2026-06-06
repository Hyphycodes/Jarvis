import assert from "node:assert/strict";
import { looksActionable } from "../lib/chat/actionableGate";

// Actionable: the owner naming something they want to do/try/get.
for (const msg of [
  "I want to try Pizz'Amici next week",
  "let's go to that new natural wine bar Friday",
  "take me to the Art Institute this weekend",
  "I need to book Smyth for the anniversary",
  "thinking about going to the Riot Fest",
  "add the new Aime Leon Dore drop to my radar",
  "I should check out Kasama",
  "let's try out the omakase counter in West Loop",
]) {
  assert.equal(looksActionable(msg), true, `should be actionable: ${msg}`);
}

// Not actionable: vague exploration, questions, chit-chat.
for (const msg of [
  "what's good this weekend?",
  "any ideas for date night?",
  "how's my week looking",
  "tell me about that place",
  "thanks!",
  "who should I bring",
]) {
  assert.equal(looksActionable(msg), false, `should NOT be actionable: ${msg}`);
}

console.log("✓ intent-capture gate tests passed");
