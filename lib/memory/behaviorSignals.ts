import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { evaluateBehaviorForMemory } from "@/lib/memory/memoryRules";
import { createMemoryProposal } from "@/lib/memory/memoryProposals";
import type { UserBehaviorSignal } from "@/lib/memory/types";

export async function recordBehaviorSignal(
  signal: UserBehaviorSignal,
): Promise<void> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const subjectId = subjectFromSignal(signal);
  const canonical = canonicalBehavior(signal, subjectId);

  const { error } = await supabase.from("behavior_signals").insert({
    user_id: owner.id,
    signal_type: signal.type,
    subject_id: subjectId,
    object_type: canonical.entityType,
    object_id: canonical.entityId,
    metadata: canonical.metadata,
    payload: {
      ...signal,
      canonical,
    },
  });
  if (error) throw new Error(error.message);

  const decision = evaluateBehaviorForMemory(signal);
  if (!decision.shouldPropose || !decision.type) return;

  await createMemoryProposal({
    userId: owner.id,
    type: decision.type,
    content: proposalContent(signal, subjectId),
    confidence: decision.confidence,
    shouldSave: true,
    reason: decision.reason,
    evidence: decision.evidence,
    requiresUserApproval: true,
  });
}

function canonicalBehavior(
  signal: UserBehaviorSignal,
  subjectId: string,
): {
  source: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
} {
  const [source, actionRaw] = signal.type.split(".");
  const action = actionRaw ?? signal.type;
  const entityType =
    signal.type.startsWith("plan.") && "planId" in signal
      ? "plan"
      : "itemId" in signal
        ? "radar_item"
        : "planId" in signal
          ? "plan"
          : "memoryProposalId" in signal
            ? "memory"
            : "event";
  const entityId = subjectId === "unknown" ? null : subjectId;
  const metadata: Record<string, unknown> = {
    source,
    action,
    entity_type: entityType,
  };
  if ("category" in signal && signal.category) metadata.category = signal.category;
  if ("planId" in signal && signal.planId) metadata.plan_id = signal.planId;
  if ("itemId" in signal && signal.itemId) metadata.item_id = signal.itemId;
  if ("scheduledDate" in signal) metadata.scheduled_date = signal.scheduledDate;
  if ("scheduledTime" in signal) metadata.scheduled_time = signal.scheduledTime;
  if ("fallbackUsed" in signal) metadata.fallback_used = signal.fallbackUsed ?? false;
  if ("learning" in signal && signal.learning) metadata.learning = signal.learning;
  return {
    source,
    action,
    entityType,
    entityId,
    metadata,
  };
}

function subjectFromSignal(signal: UserBehaviorSignal): string {
  if ("itemId" in signal && typeof signal.itemId === "string") return signal.itemId;
  if ("planId" in signal && typeof signal.planId === "string") return signal.planId;
  if (
    "memoryProposalId" in signal &&
    typeof signal.memoryProposalId === "string"
  ) {
    return signal.memoryProposalId;
  }
  return "unknown";
}

function proposalContent(signal: UserBehaviorSignal, subjectId: string) {
  switch (signal.type) {
    case "radar.save":
    case "item.save":
      return `Saved item: ${subjectId}`;
    case "radar.pass":
    case "item.pass":
      return `Passed item: ${subjectId}`;
    case "item.plan":
      return `Planned item: ${subjectId}`;
    case "item.complete":
      return `Completed item: ${subjectId}`;
    case "item.open":
      return `Opened item: ${subjectId}`;
    case "item.show":
      return `Shown item: ${subjectId}`;
    case "item.archive":
      return `Archived item: ${subjectId}`;
    case "item.restore":
      return `Restored item: ${subjectId}`;
    case "plan.open":
      return `Opened plan: ${subjectId}`;
    case "plan.activate":
      return `Activated plan: ${subjectId}`;
    case "plan.complete":
      return `Completed plan: ${subjectId}`;
    case "plan.cancel":
      return `Cancelled plan: ${subjectId}`;
    case "timeline.complete":
      return `Completed timeline item: ${subjectId}`;
    case "memory.accept":
    case "memory.reject":
    case "memory.archive":
      return `Reviewed memory proposal: ${subjectId}`;
    case "plan.generated":
      return `Generated plan: ${subjectId}`;
    case "plan.started":
      return `Started plan: ${subjectId}`;
    case "plan.scheduled":
      return `Scheduled plan: ${subjectId}`;
    case "plan.completed":
      return `Completed plan: ${subjectId}`;
    case "plan.cancelled":
      return `Cancelled plan: ${subjectId}`;
    case "plan.viewed":
      return `Viewed plan: ${subjectId}`;
    case "plan.section_opened":
      return `Opened plan section: ${subjectId}`;
  }
}
