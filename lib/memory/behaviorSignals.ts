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

  const { error } = await supabase.from("behavior_signals").insert({
    user_id: owner.id,
    signal_type: signal.type,
    subject_id: subjectId,
    payload: signal,
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
