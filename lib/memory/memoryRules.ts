import type {
  MemoryDecision,
  MemoryType,
  UserBehaviorSignal,
} from "@/lib/memory/types";

export function evaluateBehaviorForMemory(
  signal: UserBehaviorSignal,
): MemoryDecision {
  switch (signal.type) {
    case "memory.accept":
    case "memory.reject":
    case "memory.archive":
      return noProposal("Memory approval actions update proposal state directly.");
    case "timeline.complete":
      return {
        shouldPropose: true,
        type: "confirmed_behavior",
        confidence: 0.72,
        strength: "strong",
        reason: "Completed timeline items are stronger than opened plans.",
        evidence: [`timeline.complete:${signal.itemId}`],
      };
    case "plan.complete":
      return planProposal("confirmed_behavior", 0.82, "strong", signal.planId, signal.type);
    case "plan.activate":
      return planProposal("event_history", 0.74, "strong", signal.planId, signal.type);
    case "plan.open":
      return planProposal("event_history", 0.55, "medium", signal.planId, signal.type);
    case "plan.cancel":
      return planProposal("avoidance", 0.58, "medium", signal.planId, signal.type);
    case "radar.save":
    case "item.save":
      return itemProposal("taste", 0.55, "weak", signal.itemId, signal.type);
    case "radar.pass":
    case "item.pass":
      return itemProposal("avoidance", 0.48, "weak", signal.itemId, signal.type);
    case "item.plan":
      return itemProposal("taste", 0.7, "strong", signal.itemId, signal.type);
    case "item.complete":
      return itemProposal("confirmed_behavior", 0.82, "strongest", signal.itemId, signal.type);
    case "item.open":
      return noProposal("Opening an item is engagement, not durable preference.");
    case "item.show":
    case "item.archive":
    case "item.restore":
      return noProposal("Surface-only lifecycle change; no inference worth proposing.");
    // Sprint 3.1 — plan-as-object events. The persistent feedback loop is
    // memory promotion; these signals just log behavior. The richer
    // plan.complete / plan.cancel signals above already drive proposals.
    case "plan.generated":
      return noProposal("Generation is system-driven; user signal arrives later via start/complete.");
    case "plan.started":
      return planProposal("event_history", 0.7, "strong", signal.planId, signal.type);
    case "plan.completed":
      return planProposal("confirmed_behavior", 0.85, "strongest", signal.planId, signal.type);
    case "plan.cancelled":
      return planProposal("avoidance", 0.55, "medium", signal.planId, signal.type);
    case "plan.viewed":
    case "plan.section_opened":
      return noProposal("Viewing is engagement, not durable preference.");
  }
}

export function shouldAutoCommitMemory(_decision: MemoryDecision): boolean {
  return false;
}

function itemProposal(
  type: MemoryType,
  confidence: number,
  strength: MemoryDecision["strength"],
  itemId: string,
  signalType: UserBehaviorSignal["type"],
): MemoryDecision {
  return {
    shouldPropose: true,
    type,
    confidence,
    strength,
    reason: "Behavior signal is useful, but should remain a proposal until accepted.",
    evidence: [`${signalType}:${itemId}`],
  };
}

function planProposal(
  type: MemoryType,
  confidence: number,
  strength: MemoryDecision["strength"],
  planId: string,
  signalType: UserBehaviorSignal["type"],
): MemoryDecision {
  return {
    shouldPropose: true,
    type,
    confidence,
    strength,
    reason: "Plan behavior can compound future taste once reviewed.",
    evidence: [`${signalType}:${planId}`],
  };
}

function noProposal(reason: string): MemoryDecision {
  return {
    shouldPropose: false,
    confidence: 0,
    strength: "weak",
    reason,
    evidence: [],
  };
}
