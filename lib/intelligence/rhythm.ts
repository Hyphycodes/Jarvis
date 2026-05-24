import "server-only";

import type { IndexedItem } from "@/lib/index/types";
import type { JarvisContext, RhythmRead } from "@/lib/intelligence/types";

export function readRhythm(item: IndexedItem, context?: JarvisContext): RhythmRead {
  const now = context ? new Date(context.now) : new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const workday = day >= 1 && day <= 5;
  const effort = item.briefing?.effort_level ?? "unknown";
  const spend = item.briefing?.spending_posture ?? "unknown";
  const notes: string[] = [];
  let phase: RhythmRead["phase"] = "unknown";
  let score = 0.64;

  if (!workday) {
    phase = "weekend";
    score += effort === "high" ? 0.06 : 0.02;
  } else if (hour < 7) {
    phase = "morning";
    if (effort === "high") score -= 0.1;
    notes.push("Morning is protected.");
  } else if (hour < 15) {
    phase = "work";
    score -= 0.08;
    notes.push("Work block lowers interruption tolerance.");
  } else if (hour < 17) {
    phase = "commute";
    score += effort === "low" ? 0.05 : -0.03;
    notes.push("After-work window is opening.");
  } else {
    phase = "evening";
    score += effort === "low" || effort === "medium" ? 0.07 : -0.04;
  }

  if (item.startsAt) score += 0.06;
  if (effort === "low") score += 0.06;
  if (effort === "high" && workday) score -= 0.12;
  if ((spend === "paid" || spend === "high") && workday) score -= 0.06;

  return {
    score: clamp01(score),
    label: labelFor(phase),
    phase,
    notes,
  };
}

function labelFor(phase: RhythmRead["phase"]): string {
  switch (phase) {
    case "morning":
      return "Protected morning";
    case "work":
      return "Work block";
    case "commute":
      return "After-work window";
    case "evening":
      return "Evening fit";
    case "weekend":
      return "Weekend fit";
    default:
      return "Timing unknown";
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

