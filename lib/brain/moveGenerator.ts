import "server-only";

import { mergeBriefingIntoPayload } from "@/lib/brain/briefingTypes";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { CreateIndexedItemInput } from "@/lib/index/types";

export type SyntheticMove = {
  title: string;
  type: "move";
  category:
    | "health"
    | "outdoors"
    | "creative"
    | "style"
    | "business"
    | "land"
    | "social"
    | "general";
  action_title: string;
  one_line: string;
  why_it_fits: string;
  best_window?: string;
  effort_level: "low" | "medium" | "high";
  spending_posture: "free" | "low" | "paid" | "high";
  suggested_destination: "radar" | "holding" | "today" | "discovered";
  confidence: number;
};

export function generateSyntheticMoves(input: {
  context: BrainContextPacket;
  mode: "radar_discovery" | "weekend_preview" | "north_reflection";
  activeRadarCount: number;
}): SyntheticMove[] {
  const now = new Date(input.context.now);
  const day = now.getDay();
  const hour = now.getHours();
  const workday = day >= 1 && day <= 5;
  const weekend = day === 0 || day === 6;
  const moves: SyntheticMove[] = [];

  if (input.mode === "north_reflection") {
    moves.push({
      title: "Review one land lead",
      type: "move",
      category: "land",
      action_title: "Land listing to review",
      one_line: "A quiet north-facing review, not an urgent move.",
      why_it_fits: "Keeps the land and independence thread alive without turning it into a fake emergency.",
      best_window: "Weekend morning or a low-noise evening.",
      effort_level: "low",
      spending_posture: "free",
      suggested_destination: "holding",
      confidence: 0.61,
    });
    return moves;
  }

  if (workday && hour < 16) {
    moves.push({
      title: "Workday recovery block",
      type: "move",
      category: "health",
      action_title: "Recovery block after work",
      one_line: "Low-cost reset after the Schaumburg window closes.",
      why_it_fits: "It respects the work rhythm and keeps the evening useful without forcing a production.",
      best_window: "After 4:30 PM.",
      effort_level: "low",
      spending_posture: "free",
      suggested_destination: "holding",
      confidence: 0.58,
    });
  }

  if (workday && hour >= 15 && input.activeRadarCount < 3) {
    moves.push({
      title: "Quiet coffee reset",
      type: "move",
      category: "general",
      action_title: "Quiet coffee reset",
      one_line: "A clean after-work reset if the day needs a second gear.",
      why_it_fits: "Low friction, low spend, and useful without pretending the whole night needs a plan.",
      best_window: "After getting home.",
      effort_level: "low",
      spending_posture: "low",
      suggested_destination: "radar",
      confidence: 0.68,
    });
  }

  if (weekend || input.mode === "weekend_preview") {
    moves.push({
      title: "Horseback riding experience",
      type: "move",
      category: "outdoors",
      action_title: "Horseback riding experience",
      one_line: "A stronger weekend idea than another passive feed scroll.",
      why_it_fits: "Outdoor, cinematic, and different enough to be worth holding for the right window.",
      best_window: "Weekend daylight.",
      effort_level: "medium",
      spending_posture: "paid",
      suggested_destination: "holding",
      confidence: 0.64,
    });
    moves.push({
      title: "Weekend golf window",
      type: "move",
      category: "outdoors",
      action_title: "Weekend golf window",
      one_line: "A simple active block if the weather and tee time line up.",
      why_it_fits: "Clear, physical, and easy to either act on or ignore without clutter.",
      best_window: "Saturday or Sunday morning.",
      effort_level: "medium",
      spending_posture: "paid",
      suggested_destination: "holding",
      confidence: 0.62,
    });
  }

  return moves.slice(0, 3);
}

export function syntheticMoveToCandidate(move: SyntheticMove): CreateIndexedItemInput {
  const now = new Date().toISOString();
  const briefing = {
    display_title: move.action_title,
    display_category: categoryLabel(move.category),
    one_line: move.one_line,
    jarvis_take:
      move.suggested_destination === "radar"
        ? "Strong fit, low friction."
        : "Good signal, not urgent.",
    why_it_matters: move.why_it_fits,
    why_now: move.best_window,
    best_next_action:
      move.suggested_destination === "radar" ? ("save" as const) : ("hold" as const),
    confidence: move.confidence,
    confidence_label:
      move.confidence >= 0.74 ? ("high" as const) : move.confidence >= 0.5 ? ("medium" as const) : ("low" as const),
    effort_level: move.effort_level,
    spending_posture: move.spending_posture,
    suggested_destination: move.suggested_destination === "today" ? ("radar" as const) : move.suggested_destination,
    quality_flags: [],
    evidence_summary: "Generated from current rhythm and recent behavior, not an external source.",
    cleaned_tags: ["move", move.category],
  };
  return {
    type: "recommendation",
    destination:
      move.suggested_destination === "today"
        ? "today"
        : move.suggested_destination === "holding"
          ? "holding"
          : "radar",
    source: "ai",
    sourceId: `synthetic_move:${move.action_title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    title: move.action_title,
    category: move.category,
    description: move.one_line,
    status: "discovered",
    score: move.confidence,
    reasons: [move.why_it_fits, move.best_window ?? ""].filter(Boolean),
    tags: ["synthetic_move", "move", move.category, move.effort_level, move.spending_posture],
    rawPayload: mergeBriefingIntoPayload(
      {
        source: "synthetic_move",
        move_title: move.action_title,
        generated_at: now,
        best_window: move.best_window ?? null,
      },
      briefing,
      { generated_at: now, fallback_used: true, fallback_reason: "synthetic move" },
    ),
  };
}

function categoryLabel(category: SyntheticMove["category"]): string {
  switch (category) {
    case "health":
      return "Move";
    case "outdoors":
      return "Outdoors";
    case "creative":
      return "Creative";
    case "style":
      return "Style";
    case "business":
      return "Business";
    case "land":
      return "Land";
    case "social":
      return "Social";
    default:
      return "Move";
  }
}
