import type { PlanDetailPayload } from "@/lib/ai/types";

export function buildPlanDetailPayload(
  input: Partial<PlanDetailPayload> & Pick<PlanDetailPayload, "id">,
): PlanDetailPayload {
  return {
    id: input.id,
    category: input.category ?? "",
    title: input.title ?? "",
    date: input.date ?? "",
    locationLine: input.locationLine ?? "",
    summary: input.summary ?? "",
    liveState: input.liveState ?? { enabled: false, label: "BEGIN" },
    keyStats: input.keyStats ?? {},
    sections: input.sections ?? [],
    quoteCard: input.quoteCard,
  };
}
