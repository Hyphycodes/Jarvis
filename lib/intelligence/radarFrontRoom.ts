import "server-only";

import {
  evaluateCandidateForRadar,
  RADAR_ADMISSION_MIN_CONFIDENCE,
} from "@/lib/brain/decisionCouncil";
import type { ItemBriefing } from "@/lib/brain/briefingTypes";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { IndexedItem, IndexDestination } from "@/lib/index/types";
import type { RadarDecision } from "@/lib/brain/decisionCouncilTypes";

export type RadarFrontRoomDecision = {
  allowed: boolean;
  flags: string[];
  reason: string;
  suggestedDestination: Extract<IndexDestination, "radar" | "holding"> | "discovered" | "archived";
  moveTitle: string;
  purposeLabel: string;
  council: RadarDecision;
};

export const RADAR_FRONT_ROOM_MIN_CONFIDENCE = RADAR_ADMISSION_MIN_CONFIDENCE;

export function evaluateActiveRadarItem(
  item: IndexedItem,
  briefingOverride?: ItemBriefing,
  brainContext?: BrainContextPacket,
): RadarFrontRoomDecision {
  const council = evaluateCandidateForRadar(item, {
    briefingOverride,
    brainContext,
  });
  return {
    allowed: council.admission === "radar",
    flags: council.negative_flags,
    reason: council.rejection_reason ?? "Front-room ready",
    suggestedDestination:
      council.admission === "archive"
        ? "archived"
        : council.admission === "discovered"
          ? "discovered"
          : council.admission,
    moveTitle: council.move_title,
    purposeLabel: council.purpose_label,
    council,
  };
}
