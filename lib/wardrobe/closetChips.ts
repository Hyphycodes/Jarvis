import type { ChatChip } from "@/lib/chat/types";

/**
 * Closet-context action chips shown after a wardrobe import — NOT the generic
 * Radar chips. Confirm Items only appears once we know something needs review.
 * Shared by the server (instant ack) and the client (completion message).
 */
export function buildClosetChips(
  jobId: string,
  opts: { needsConfirmation?: boolean } = {},
): ChatChip[] {
  const chips: ChatChip[] = [
    { label: "Review Closet", message: "Open my closet.", action_type: "open_closet", payload: {} },
  ];
  if (opts.needsConfirmation) {
    chips.push({
      label: "Confirm Items",
      message: "Confirm the uncertain pieces.",
      action_type: "open_closet",
      payload: { filter: "needs_confirmation" },
    });
  }
  chips.push({
    label: "Undo Import",
    message: "Undo that closet import.",
    action_type: "undo_import",
    payload: { job_id: jobId },
  });
  return chips;
}
