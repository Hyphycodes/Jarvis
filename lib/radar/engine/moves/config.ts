/**
 * Moves engine — sub-library config + classification + shared brain-tree types
 * (per jarvis-moves-engine-brain-tree.md). Moves are GENERATED executable actions
 * (sequence + gear), EVERGREEN, with Energy + Weather brains (Moves-specific).
 * One warehouse (moves_items.sub_library). Pure + dependency-light.
 */

import type { PillarSlug } from "@/lib/north/attributionMap";

export type MoveSubLibrary =
  | "moves_sports"
  | "moves_training"
  | "moves_outdoor"
  | "moves_social"
  | "moves_recovery"
  | "moves_creative"
  | "moves_skill"
  | "moves_lifestyle";

export const MOVE_SUBLIBRARIES: MoveSubLibrary[] = [
  "moves_sports",
  "moves_training",
  "moves_outdoor",
  "moves_social",
  "moves_recovery",
  "moves_creative",
  "moves_skill",
  "moves_lifestyle",
];

export type MoveSubLibraryConfig = {
  subLibrary: MoveSubLibrary;
  label: string;
  pillars: PillarSlug[];
  examples: string;
  brief: string;
};

export const MOVES_SUBLIBRARIES: Record<MoveSubLibrary, MoveSubLibraryConfig> = {
  moves_sports: {
    subLibrary: "moves_sports",
    label: "Sports",
    pillars: ["body", "relationships"],
    examples: "basketball shootaround, pickleball, golf range, soccer run, batting cages",
    brief: "Concrete, doable sports with a real venue/court when needed. Body + social payoff, weather-aware, gear-aware.",
  },
  moves_training: {
    subLibrary: "moves_training",
    label: "Training",
    pillars: ["body", "skill"],
    examples: "gym session, boxing class, conditioning, mobility/recovery lift, bag work",
    brief: "Sustainable training matched to energy/recovery — consistency over heroics. Skip high-intensity when recovery context says no.",
  },
  moves_outdoor: {
    subLibrary: "moves_outdoor",
    label: "Outdoor",
    pillars: ["peace", "creative"],
    examples: "lakefront walk, Gold Coast cigar walk, camera walk, sunset walk, neighborhood drift",
    brief: "Low-pressure outdoor resets with a clear route + best time. Weather-sensitive; pairs with cigars/coffee/dining.",
  },
  moves_social: {
    subLibrary: "moves_social",
    label: "Social",
    pillars: ["relationships"],
    examples: "pickleball with Kamila, cigar with dad, dinner+walk flow, game night, coffee catch-up",
    brief: "Natural, low-pressure relationship moves grounded in real people/context. Not stiff networking, not generic 'hang with friends'.",
  },
  moves_recovery: {
    subLibrary: "moves_recovery",
    label: "Recovery",
    pillars: ["peace"],
    examples: "Sunday reset, steak/cook at home, sauna, early night, meal prep, quiet coffee",
    brief: "Restorative, sleep-protecting, anti-burnout moves. Protect tomorrow; respect spend (no expensive spa on Saving with weak value).",
  },
  moves_creative: {
    subLibrary: "moves_creative",
    label: "Creative",
    pillars: ["creative"],
    examples: "camera walk, location scout, DJ crate session, photo test, writing block, record store visit",
    brief: "Concrete creative output/input with a starting point + gear. Never 'be creative' — a specific action that builds momentum.",
  },
  moves_skill: {
    subLibrary: "moves_skill",
    label: "Skill",
    pillars: ["skill"],
    examples: "golf lesson, boxing class, Spanish practice, DJ practice, real-estate study/networking",
    brief: "Compounding skill with a clear next step. Realistic, scheduled, tied to his actual direction. Not 'learn something'.",
  },
  moves_lifestyle: {
    subLibrary: "moves_lifestyle",
    label: "Lifestyle",
    pillars: ["ownership", "taste"],
    examples: "hosting prep, cigar session, closet upgrade execution, steak/grocery run, gift pickup, travel prep",
    brief: "Useful life-quality / friction-reducing moves with real payoff. Not random errands or shopping noise.",
  },
};

// ── Classification ─────────────────────────────────────────────────────────────
const SKILL_RE = /\b(lesson|class|practice|workshop|study|drill|course|learn)\b/i;
const TRAIN_RE = /\b(gym|boxing|lift|strength|conditioning|workout|bag work|martial|mobility)\b/i;
const SPORT_RE = /\b(basketball|pickleball|soccer|tennis|golf range|batting|volleyball|shootaround|pickup|driving range)\b/i;
const SOCIAL_RE = /\b(with kamila|with dad|family|friends|game night|hosting|catch[- ]up|group|tailgate)\b/i;
const RECOVERY_RE = /\b(reset|recovery|sauna|spa|early night|meal prep|grocery|decompress|quiet coffee|rest)\b/i;
const CREATIVE_RE = /\b(camera|photo|location scout|dj|crate|writing|record store|color grade|film capture|shoot)\b/i;
const OUTDOOR_RE = /\b(walk|lakefront|trail|park|cigar walk|drift|sunset|outdoor|riverwalk|scenic drive)\b/i;
const LIFESTYLE_RE = /\b(closet|wardrobe|errand|detailing|cigars?|barware|gift|travel prep|organization|setup)\b/i;

export function classifyMoveSubLibrary(input: {
  title?: string | null;
  description?: string | null;
  activity_type?: string | null;
  vibe_keywords?: string[] | null;
}): MoveSubLibrary {
  const blob = [input.title, input.description, input.activity_type, ...(input.vibe_keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (SPORT_RE.test(blob)) return "moves_sports";
  if (TRAIN_RE.test(blob)) return "moves_training";
  if (SKILL_RE.test(blob)) return "moves_skill";
  if (CREATIVE_RE.test(blob)) return "moves_creative";
  if (SOCIAL_RE.test(blob)) return "moves_social";
  if (RECOVERY_RE.test(blob)) return "moves_recovery";
  // Outdoor before lifestyle so a "cigar walk" is outdoor (a cigar *session* is lifestyle).
  if (OUTDOOR_RE.test(blob)) return "moves_outdoor";
  if (LIFESTYLE_RE.test(blob)) return "moves_lifestyle";
  return "moves_outdoor";
}

export function isMoveSubLibrary(value: unknown): value is MoveSubLibrary {
  return typeof value === "string" && (MOVE_SUBLIBRARIES as string[]).includes(value);
}

// ── Shared brain-tree decision types ────────────────────────────────────────────

export type MoveSurface = "today" | "radar" | "reserve" | "suppress";

export type MoveTruthAssessment = {
  action_confidence: number;
  source_quality: "verified" | "strong" | "partial" | "weak" | "unknown";
  verified_facts: string[];
  inferred_context: string[];
  missing_action_data: string[];
  needs_enrichment: boolean;
};

export type MoveFitAssessment = {
  fit_score: number;
  timing_fit: "now" | "today" | "this_week" | "later" | "bad_timing";
  friction_level: "low" | "medium" | "high" | "unknown";
  energy_fit: "right" | "too_much" | "too_low" | "unknown";
  budget_fit: "comfortable" | "premium_but_ok" | "stretch" | "bad_fit" | "unknown";
  recommended_surface: MoveSurface;
  reasons: string[];
  vetoes: string[];
};

export type MoveEnergyAssessment = {
  energy_required: "low" | "medium" | "high";
  energy_payoff: "restorative" | "energizing" | "discipline" | "social" | "creative" | "unknown";
  recovery_risk: "low" | "medium" | "high";
  reason: string;
};

export type MoveWeatherAssessment = {
  weather_required: boolean;
  weather_fit: "good" | "okay" | "bad" | "unknown";
  weather_notes: string[];
  alternative_if_bad?: string | null;
};

export type MovePlanabilityAssessment = {
  plan_ready: boolean;
  start_location?: string | null;
  suggested_duration_minutes?: number | null;
  gear_needed: string[];
  booking_required: boolean;
  booking_url?: string | null;
  missing_plan_data: string[];
  suggested_pairings: string[];
};
