import type { BrainContextPacket } from "@/lib/brain/types";
import type { ItemBriefing } from "@/lib/brain/briefingTypes";
import type { IndexedItem } from "@/lib/index/types";

export type RadarAdmission = "radar" | "holding" | "discovered" | "archive";
export type RadarDisplayDepth = "minimal" | "compact" | "rich";

export type CouncilScores = {
  scout: number;
  operator: number;
  taste: number;
  growth: number;
  critic: number;
};

export type RadarDecision = {
  admission: RadarAdmission;
  confidence: number;
  purpose_label: string;
  move_title: string;
  one_line: string;
  best_move: string;
  display_depth: RadarDisplayDepth;
  positive_signals: string[];
  negative_flags: string[];
  council_scores: CouncilScores;
  rejection_reason?: string;
  /** The confidence floor that was actually applied to this candidate. Useful
   * for control-room diagnostics. Equals RADAR_ADMISSION_MIN_CONFIDENCE (0.72)
   * when no occasion-specific override applies. */
  appliedConfidenceFloor: number;
};

export type RadarCouncilContext = {
  brainContext?: BrainContextPacket;
  briefingOverride?: ItemBriefing;
  /**
   * Optional time-of-day context ("morning" | "midday" | "after_work" |
   * "evening" | "weekend"). When provided, occasion-aware confidence floors
   * that depend on time context use this value. When omitted, the floor is
   * derived from brainContext.now + brainContext.founder.timezone, or falls
   * back to the 0.72 global baseline.
   */
  timeContext?: string;
};

export type RadarCouncilInput = {
  candidate: IndexedItem;
  context?: RadarCouncilContext;
};
