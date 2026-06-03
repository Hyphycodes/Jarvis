import type { WatchConditions } from "@/lib/items/intents";

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
  | { type: "radar.save"; itemId: string; learning?: BehaviorLearningPayload }
  | { type: "radar.pass"; itemId: string; learning?: BehaviorLearningPayload }
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
  | { type: "item.save"; itemId: string; category?: string; learning?: BehaviorLearningPayload }
  | { type: "item.pass"; itemId: string; category?: string; learning?: BehaviorLearningPayload }
  | { type: "item.plan"; itemId: string; planId?: string; learning?: BehaviorLearningPayload }
  | { type: "item.intent"; itemId: string; intent: string; category?: string; learning?: BehaviorLearningPayload }
  | { type: "item.complete"; itemId: string }
  | { type: "item.archive"; itemId: string; learning?: BehaviorLearningPayload }
  | { type: "item.restore"; itemId: string }
  // Sprint 3.1 — plan as first-class object
  | { type: "plan.generated"; planId: string; itemId?: string; fallbackUsed?: boolean }
  | { type: "plan.started"; planId: string }
  | { type: "plan.scheduled"; planId: string; scheduledDate: string; scheduledTime: string }
  | { type: "plan.completed"; planId: string }
  | { type: "plan.cancelled"; planId: string }
  | { type: "plan.viewed"; planId: string }
  | { type: "plan.section_opened"; planId: string; sectionKey: string };

export type BehaviorSignalStrength = "weak" | "medium" | "strong" | "strongest";

export type MemoryDecision = {
  shouldPropose: boolean;
  type?: MemoryType;
  confidence: number;
  strength: BehaviorSignalStrength;
  reason: string;
  evidence: string[];
};

export type BehaviorLearningPayload = {
  category?: string;
  vibe?: string;
  sourceDomain?: string;
  purposeLabel?: string;
  confidence?: number;
  reasonSurfaced?: string;
  actionTitle?: string;
  passReason?: string;
  intent?: string;
  watchConditions?: WatchConditions;
};
