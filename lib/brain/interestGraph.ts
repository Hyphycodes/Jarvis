/**
 * Interest Graph builder.
 *
 * Layers behavior + memory on top of the static seed at runtime — no schema,
 * no new table. Graph snapshots flow downstream into the Taste Strategist
 * and (compressed) into `brain_decision_runs.raw_output` for audit.
 */

import { buildSeedInterests, getSeedTopLevelIds } from "@/lib/brain/interestSeed";
import type {
  Interest,
  InterestGraph,
  InterestStatus,
} from "@/lib/brain/interests";
import type { BrainContextPacket } from "@/lib/brain/types";

export type BuildInterestGraphInput = {
  context: BrainContextPacket;
};

/**
 * Compose the live Interest Graph: seed → memory adjustments → behavior nudges.
 * The result is a transient snapshot for this refresh run.
 */
export function buildInterestGraph(input: BuildInterestGraphInput): InterestGraph {
  const seed = buildSeedInterests();
  const byId: Record<string, Interest> = {};
  for (const node of seed) byId[node.id] = node;

  const origin = {
    seedCount: seed.length,
    memoryInferred: 0,
    behaviorAdjusted: 0,
  };

  // ── Memory layer ──────────────────────────────────────────────────────────
  // Each memory item nudges the closest matching interest's weight/confidence.
  // We only adjust — we never invent new interests from memory (those should
  // go through the memory proposal system first).
  for (const m of input.context.memory) {
    const matched = matchMemoryToInterest(m.content, byId);
    if (!matched) continue;
    const conf = clamp01(m.confidence);
    matched.weight = clamp01(matched.weight + 0.05 * conf);
    matched.confidence = clamp01(
      Math.max(matched.confidence, 0.4 + 0.5 * conf),
    );
    if (matched.status === "dormant" && conf > 0.5) matched.status = "active";
    origin.memoryInferred++;
  }

  // ── Behavior layer ────────────────────────────────────────────────────────
  // Recent actions adjust weights short-term. The persistent feedback loop
  // is handled by `interestFeedback.ts` via the memory proposal system.
  for (const action of input.context.recentActions) {
    const matched = matchTextToInterest(
      `${action.title} ${action.category ?? ""}`,
      byId,
    );
    if (!matched) continue;
    const delta =
      action.status === "completed" ? 0.04 :
      action.status === "planned" ? 0.03 :
      action.status === "saved" ? 0.02 :
      action.status === "passed" ? -0.02 :
      0;
    if (delta === 0) continue;
    matched.weight = clamp01(matched.weight + delta);
    if (delta > 0 && matched.status === "dormant") matched.status = "active";
    origin.behaviorAdjusted++;
  }

  // ── Avoid keywords ──────────────────────────────────────────────────────
  // Anything that explicitly hits the founder's avoid list gets demoted.
  const avoidWords = input.context.founder.avoidKeywords.map((w) =>
    w.toLowerCase(),
  );
  for (const node of Object.values(byId)) {
    const lowered = node.label.toLowerCase();
    if (avoidWords.some((w) => lowered.includes(w))) {
      node.status = "avoid";
      node.weight = Math.min(node.weight, 0.1);
    }
  }

  return {
    byId,
    topLevel: getSeedTopLevelIds(),
    builtAt: new Date().toISOString(),
    origin,
  };
}

// ── Matching helpers ─────────────────────────────────────────────────────────

/**
 * Try to associate a memory item's content with an existing interest by
 * keyword overlap. Returns the *parent area* interest when a subinterest
 * matches — keeps the graph adjustments at the area level.
 */
function matchMemoryToInterest(
  content: string,
  byId: Record<string, Interest>,
): Interest | null {
  return matchTextToInterest(content, byId);
}

function matchTextToInterest(
  text: string,
  byId: Record<string, Interest>,
): Interest | null {
  const lowered = text.toLowerCase();
  let best: { node: Interest; hits: number } | null = null;

  for (const node of Object.values(byId)) {
    let hits = 0;
    // Label
    const label = node.label.toLowerCase();
    for (const word of splitWords(label)) {
      if (word.length >= 4 && lowered.includes(word)) hits++;
    }
    // Examples + avoid notes — heavier weight
    for (const ex of node.examples) {
      const lowEx = ex.toLowerCase();
      for (const word of splitWords(lowEx)) {
        if (word.length >= 4 && lowered.includes(word)) hits += 2;
      }
    }
    if (hits > 0 && (!best || hits > best.hits)) best = { node, hits };
  }

  if (!best) return null;
  // If the match is a subinterest, return its top-level parent for stable nudges.
  if (best.node.parentId) {
    const parent = byId[best.node.parentId];
    return parent ?? best.node;
  }
  return best.node;
}

function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from",
  "have", "into", "your", "their", "his", "her", "its",
  "are", "was", "but", "any", "all", "not", "you",
]);

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ── Status overrides ─────────────────────────────────────────────────────────

/**
 * Force a particular interest into a target status. Used by feedback and
 * memory acceptance flows. Returns the updated node (mutated in place).
 */
export function overrideInterestStatus(
  graph: InterestGraph,
  interestId: string,
  status: InterestStatus,
): Interest | null {
  const node = graph.byId[interestId];
  if (!node) return null;
  node.status = status;
  return node;
}
