import "server-only";

import { mergeBriefingIntoPayload } from "@/lib/brain/briefingTypes";
import { evaluateLifeCadence, type LifeCadenceKey } from "@/lib/brain/lifeCadence";
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
    | "ownership"
    | "skill"
    | "land"
    | "social"
    | "general";
  purpose_label: string;
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
  const cadence = evaluateLifeCadence(input.context).filter((entry) => entry.shouldSuggestNow);
  const moves: SyntheticMove[] = [];

  for (const signal of cadence.slice(0, 2)) {
    const move = moveForCadence(signal.key);
    if (move && !moves.some((existing) => existing.action_title === move.action_title)) {
      moves.push(move);
    }
  }

  return moves
    .filter((move) =>
      move.suggested_destination === "radar" ? move.confidence >= 0.72 : true,
    )
    .slice(0, 3);
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
    cleaned_tags: ["move", move.category, move.purpose_label],
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
    tags: [
      "synthetic_move",
      "move",
      move.category,
      move.purpose_label,
      move.effort_level,
      move.spending_posture,
    ],
    rawPayload: mergeBriefingIntoPayload(
      {
        source: "synthetic_move",
        move_title: move.action_title,
        purpose_label: move.purpose_label,
        generated_at: now,
        best_window: move.best_window ?? null,
      },
      briefing,
      { generated_at: now, fallback_used: true, fallback_reason: "synthetic move" },
    ),
  };
}

function moveForCadence(key: LifeCadenceKey): SyntheticMove | null {
  switch (key) {
    case "basketball":
      return cadenceMove("Play basketball outside", "Health reset", "outdoors", "Good window to get a session in.", "Keeps the body lane warm without spending money.", "After work or weekend daylight.", "low", "free", "radar", 0.73);
    case "gun_range":
      return cadenceMove("Gun range session", "Skill rep", "skill", "Controlled practice, not noise.", "A monthly skill rep with discipline and focus.", "Weekend or early evening.", "medium", "paid", "holding", 0.66);
    case "golf":
      return cadenceMove("Golf range session", "Outdoor reset", "outdoors", "A clean outdoor rep if the weather cooperates.", "Keeps the active lane warm without overcommitting.", "Weekend morning.", "medium", "paid", "holding", 0.66);
    case "spanish_music":
      return cadenceMove("Spanish song study", "Skill rep", "skill", "One song, active listening, useful repetition.", "Small rep that compounds without needing a full plan.", "Quiet evening block.", "low", "free", "holding", 0.62);
    case "dj_crates":
      return cadenceMove("DJ crate cleanup", "Creative fuel", "creative", "Clean up one lane of records or references.", "Keeps the creative system sharp and searchable.", "45-minute evening block.", "low", "free", "holding", 0.64);
    case "land_review":
      return cadenceMove("Land listing to review", "Ownership lane", "ownership", "Review one serious listing or comp.", "Keeps the ownership lane warm without forcing a decision.", "Weekend morning.", "low", "free", "holding", 0.65);
    case "woodworking":
      return cadenceMove("Woodworking joint study", "Skill rep", "skill", "One practical build concept to understand.", "Sharpens the future homestead/build lane.", "Weekend morning.", "low", "free", "holding", 0.61);
    case "creative_production":
      return cadenceMove("Camera framing practice", "Creative fuel", "creative", "One small visual rep.", "Keeps the cinematic eye active without turning it into a production.", "Quiet evening.", "low", "free", "holding", 0.63);
    case "social_room":
      return cadenceMove("Invite someone to coffee", "Social room", "social", "A low-pressure room with someone worth keeping close.", "Builds the real network, not just the feed.", "After work or weekend.", "low", "low", "holding", 0.64);
    case "gym_recovery":
      return cadenceMove("Gym recovery block", "Recovery", "health", "Low-friction recovery before the day gets away.", "Keeps discipline moving even on a workday.", "After work.", "low", "free", "radar", 0.72);
    case "outdoor_reset":
      return cadenceMove("Sunlight walk", "Outdoor reset", "outdoors", "A simple outdoor reset.", "Small physical move that clears the board.", "Lunch or after work.", "low", "free", "radar", 0.72);
  }
}

function cadenceMove(
  action_title: string,
  purpose_label: string,
  category: SyntheticMove["category"],
  one_line: string,
  why_it_fits: string,
  best_window: string,
  effort_level: SyntheticMove["effort_level"],
  spending_posture: SyntheticMove["spending_posture"],
  suggested_destination: SyntheticMove["suggested_destination"],
  confidence: number,
): SyntheticMove {
  return {
    title: action_title,
    type: "move",
    category,
    purpose_label,
    action_title,
    one_line,
    why_it_fits,
    best_window,
    effort_level,
    spending_posture,
    suggested_destination,
    confidence,
  };
}

function categoryLabel(category: SyntheticMove["category"]): string {
  switch (category) {
    case "health":
      return "Health";
    case "outdoors":
      return "Outdoors";
    case "creative":
      return "Creative";
    case "style":
      return "Style";
    case "business":
      return "Business";
    case "ownership":
    case "land":
      return "Ownership";
    case "skill":
      return "Skill";
    case "social":
      return "Social";
    default:
      return "Move";
  }
}
