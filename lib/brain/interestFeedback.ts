/**
 * Behavior → Interest Graph feedback.
 *
 * This is the short-term adjustment layer. Stable patterns are promoted
 * through the existing memory proposal system — we never write permanent
 * memory directly here.
 *
 * Called from item-action server actions (lib/actions/items.ts) after a
 * user saves/passes/plans/completes/archives a Radar item. Inferences are
 * weak by default; only repeated patterns become memory proposals.
 */

import "server-only";

import type { InterestGraph } from "@/lib/brain/interests";
import { buildInterestGraph } from "@/lib/brain/interestGraph";
import { buildBrainContext } from "@/lib/brain/context";

export type FeedbackSignal = {
  itemId: string;
  status:
    | "saved"
    | "passed"
    | "planned"
    | "completed"
    | "archived"
    | "restored";
  category?: string | null;
  type?: string | null;
  tags?: string[];
};

export type FeedbackAdjustment = {
  interestId: string;
  delta: number;
  reason: string;
};

export type FeedbackResult = {
  /** Live-snapshot adjustments — not persisted on their own. */
  adjustments: FeedbackAdjustment[];
  /** Stable pattern observations that may warrant a memory proposal. */
  patternHints: Array<{
    interestId: string;
    pattern: "repeated_save" | "repeated_pass" | "completed_streak" | "dormant_revival";
    evidence: string[];
  }>;
};

/**
 * Build a fresh Interest Graph from current context, apply the behavior
 * signal to it, and return the deltas. Callers may pass the deltas to the
 * memory proposal system if patterns repeat — that path lives in
 * `lib/memory/memoryRules.ts` (already extended in Sprint 1).
 *
 * This function does NOT persist anything. It is a pure, observational
 * helper that callers can use to:
 *   1. log the inferred adjustment into a decision run
 *   2. surface a memory proposal when the pattern repeats N times
 */
export async function evaluateBehaviorAgainstInterests(
  signal: FeedbackSignal,
): Promise<FeedbackResult> {
  const context = await buildBrainContext();
  const graph = buildInterestGraph({ context });

  const matched = matchSignalToInterest(signal, graph);
  if (!matched) {
    return { adjustments: [], patternHints: [] };
  }

  const adjustments: FeedbackAdjustment[] = [];
  const patternHints: FeedbackResult["patternHints"] = [];

  switch (signal.status) {
    case "saved":
      adjustments.push({
        interestId: matched.id,
        delta: 0.03,
        reason: "Save signals genuine interest",
      });
      break;
    case "planned":
      adjustments.push({
        interestId: matched.id,
        delta: 0.05,
        reason: "Plan signals strong intent",
      });
      break;
    case "completed":
      adjustments.push({
        interestId: matched.id,
        delta: 0.08,
        reason: "Completion is the strongest positive signal",
      });
      break;
    case "passed":
      // Narrow weakening — pass an item, don't trash the parent area.
      adjustments.push({
        interestId: matched.id,
        delta: -0.02,
        reason: "Single pass — weak negative signal",
      });
      break;
    case "archived":
      adjustments.push({
        interestId: matched.id,
        delta: -0.01,
        reason: "Archive — reduce urgency, not interest",
      });
      break;
    case "restored":
      adjustments.push({
        interestId: matched.id,
        delta: 0.02,
        reason: "Restore suggests interest returned",
      });
      break;
  }

  // Pattern detection from recent actions
  const sameStatusCount = context.recentActions.filter(
    (a) =>
      a.status === signal.status &&
      ((signal.category && a.category === signal.category) ||
        normalizeLabel(a.title).includes(normalizeLabel(matched.label))),
  ).length;

  if (signal.status === "saved" && sameStatusCount >= 3) {
    patternHints.push({
      interestId: matched.id,
      pattern: "repeated_save",
      evidence: [
        `Saved ${sameStatusCount} items related to "${matched.label}" recently`,
      ],
    });
  }
  if (signal.status === "passed" && sameStatusCount >= 3) {
    patternHints.push({
      interestId: matched.id,
      pattern: "repeated_pass",
      evidence: [
        `Passed ${sameStatusCount} items related to "${matched.label}" recently — narrow lane fatigue`,
      ],
    });
  }
  if (signal.status === "completed" && sameStatusCount >= 2) {
    patternHints.push({
      interestId: matched.id,
      pattern: "completed_streak",
      evidence: [
        `Completed ${sameStatusCount} items in "${matched.label}" — interest is alive`,
      ],
    });
  }
  if (signal.status === "saved" && matched.status === "dormant") {
    patternHints.push({
      interestId: matched.id,
      pattern: "dormant_revival",
      evidence: [
        `Save on dormant interest "${matched.label}" — consider reactivating`,
      ],
    });
  }

  return { adjustments, patternHints };
}

// ── Matching ─────────────────────────────────────────────────────────────────

function matchSignalToInterest(
  signal: FeedbackSignal,
  graph: InterestGraph,
): { id: string; label: string; status: string } | null {
  const haystack = [
    signal.category ?? "",
    signal.type ?? "",
    ...(signal.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
  if (!haystack.trim()) return null;

  let best: { id: string; label: string; status: string; hits: number } | null = null;

  for (const node of Object.values(graph.byId)) {
    let hits = 0;
    const labelTokens = node.label.toLowerCase().split(/[\s,&/-]+/);
    for (const t of labelTokens) {
      if (t.length >= 4 && haystack.includes(t)) hits++;
    }
    for (const example of node.examples) {
      for (const t of example.toLowerCase().split(/\s+/)) {
        if (t.length >= 4 && haystack.includes(t)) hits += 2;
      }
    }
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { id: node.id, label: node.label, status: node.status, hits };
    }
  }

  if (!best) return null;
  // Walk to parent for stable, area-level adjustments
  const node = graph.byId[best.id];
  if (node?.parentId) {
    const parent = graph.byId[node.parentId];
    if (parent) {
      return { id: parent.id, label: parent.label, status: parent.status };
    }
  }
  return { id: best.id, label: best.label, status: best.status };
}

function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
