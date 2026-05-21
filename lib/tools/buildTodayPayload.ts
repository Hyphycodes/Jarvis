import type { TodayPayload, TodayTimelineItem, GrabListItem } from "@/lib/ai/types";

export function buildTodayPayload(input: Partial<TodayPayload> = {}): TodayPayload {
  return {
    hero: {
      eyebrow: input.hero?.eyebrow ?? "Today",
      date: input.hero?.date ?? new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      greeting: input.hero?.greeting ?? "Quiet day.",
      summary: input.hero?.summary ?? "Nothing strong enough to surface yet.",
      primaryPlanId: input.hero?.primaryPlanId,
      leaveBy: input.hero?.leaveBy,
    },
    timeline: input.timeline ?? [],
    grabList: input.grabList ?? [],
    livePlan: input.livePlan,
  };
}

export function buildTimelineItem(item: TodayTimelineItem): TodayTimelineItem {
  return item;
}

export function buildGrabListItem(item: GrabListItem): GrabListItem {
  return item;
}
