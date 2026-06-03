import "server-only";

import type {
  ConstraintContext,
  PlanContext,
  PreferenceContext,
  TodayContext,
  UserProfileContext,
} from "@/lib/chat/context/types";

export function getConstraintContext(input: {
  today: TodayContext;
  user: UserProfileContext;
  preferences: PreferenceContext[];
  activePlans: PlanContext[];
}): ConstraintContext[] {
  const constraints: ConstraintContext[] = [];

  for (const value of input.user.dealbreakers.slice(0, 6)) {
    constraints.push({ type: "avoidance", summary: value, source: "founder_profile.dealbreakers" });
  }
  for (const value of input.user.avoidKeywords.slice(0, 6)) {
    constraints.push({ type: "taste", summary: `Avoid ${value}`, source: "founder_profile.avoid_keywords" });
  }

  const negativeTaste = input.preferences
    .filter((p) => p.direction === "negative")
    .slice(0, 6);
  for (const pref of negativeTaste) {
    constraints.push({
      type: "taste",
      summary: `Negative taste signal: ${pref.content}`,
      source: pref.category ? `taste_signals.${pref.category}` : "taste_signals",
    });
  }

  for (const plan of input.activePlans.slice(0, 4)) {
    if (plan.status === "active" || plan.scheduledDate) {
      constraints.push({
        type: "commitment",
        summary: `${plan.title}${plan.scheduledDate ? ` on ${plan.scheduledDate}` : ""}`,
        source: "plans",
      });
    }
  }

  constraints.push({
    type: "location",
    summary: `Home base: ${input.today.homeCity ?? "Chicago"}`,
    source: "profile",
  });

  return constraints.slice(0, 18);
}
