export type MemoryType =
  | "taste"
  | "avoidance"
  | "decision_rule"
  | "relationship"
  | "north_goal"
  | "place_history"
  | "event_history"
  | "confirmed_behavior";

export type CanonicalMemoryKind =
  | "identity"
  | "preference"
  | "pattern"
  | "principle"
  | "context"
  | MemoryType;

export type CanonicalMemoryStatus =
  | "active"
  | "pending"
  | "rejected"
  | "archived"
  | "fading";

export type MemoryItem = {
  id: string;
  type: MemoryType;
  content: string;
  confidence: number;
  source: "explicit" | "inferred" | "behavior" | "system";
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  usageCount: number;
  status: "active" | "pending" | "rejected" | "archived";
  tags: string[];
};

export type MemoryUpdateProposal = {
  id: string;
  type: MemoryType;
  content: string;
  confidence: number;
  shouldSave: boolean;
  reason: string;
  evidence: string[];
  requiresUserApproval: boolean;
};

export type UserBehaviorSignal =
  | { type: "radar.save"; itemId: string }
  | { type: "radar.pass"; itemId: string }
  | { type: "plan.open"; planId: string }
  | { type: "plan.activate"; planId: string }
  | { type: "plan.complete"; planId: string }
  | { type: "plan.cancel"; planId: string }
  | { type: "timeline.complete"; itemId: string }
  | { type: "memory.accept"; memoryProposalId: string }
  | { type: "memory.reject"; memoryProposalId: string }
  | { type: "memory.archive"; memoryProposalId: string }
  | { type: "item.show"; itemId: string }
  | { type: "item.open"; itemId: string }
  | { type: "item.save"; itemId: string; category?: string }
  | { type: "item.pass"; itemId: string; category?: string }
  | { type: "item.plan"; itemId: string; planId?: string }
  | { type: "item.complete"; itemId: string }
  | { type: "item.archive"; itemId: string }
  | { type: "item.restore"; itemId: string };

export type BehaviorSignalStrength = "weak" | "medium" | "strong" | "strongest";

export type MemoryDecision = {
  shouldPropose: boolean;
  type?: MemoryType;
  confidence: number;
  strength: BehaviorSignalStrength;
  reason: string;
  evidence: string[];
};
