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
};

export type RadarCouncilContext = {
  brainContext?: BrainContextPacket;
  briefingOverride?: ItemBriefing;
};

export type RadarCouncilInput = {
  candidate: IndexedItem;
  context?: RadarCouncilContext;
};
