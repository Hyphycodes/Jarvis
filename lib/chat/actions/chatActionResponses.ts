import type { ChatChip } from "@/lib/chat/types";

export function stopPlanningChip(planId: string): ChatChip {
  return {
    label: "Stop Planning",
    message: "Stop planning.",
    action_type: "stop_planning",
    payload: { plan_id: planId },
  };
}

export function planReadyChip(planSlug: string): ChatChip {
  return {
    label: "Open Plan",
    message: "Open the plan.",
    action_type: "send_message",
    payload: { plan_slug: planSlug },
  };
}
