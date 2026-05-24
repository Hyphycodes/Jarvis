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
const HARD_ACTIVE_BLOCK_FLAGS = new Set([
  "weak_evidence",
  "social_noise",
  "instagram_noise",
  "facebook_noise",
  "raw_comment",
  "too_literal",
  "closed_event",
  "expired_event",
  "misclassified",
  "no_clear_move",
  "title_unclear",
  "directory_spam",
  "seo_junk",
  "source_lead_only",
  "generic",
  "not_actionable",
  "fake_luxury",
  "corny",
  "hype_noise",
]);

export function evaluateActiveRadarItem(
  item: IndexedItem,
  briefingOverride?: ItemBriefing,
  brainContext?: BrainContextPacket,
): RadarFrontRoomDecision {
  const council = evaluateCandidateForRadar(item, {
    briefingOverride,
    brainContext,
  });
  const storedRadarDisposition = readDisposition(item.rawPayload, "radar");
  const storedActive = storedRadarDisposition === "active";
  const hardBlocked = council.negative_flags.some((flag) => HARD_ACTIVE_BLOCK_FLAGS.has(flag));
  const allowed = (council.admission === "radar" || storedActive) && !hardBlocked;
  return {
    allowed,
    flags: council.negative_flags,
    reason:
      council.rejection_reason && !storedActive
        ? council.rejection_reason
        : storedActive && council.admission !== "radar"
          ? "Radar-worthy, not Today-urgent."
          : "Front-room ready",
    suggestedDestination:
      allowed
        ? "radar"
        : council.admission === "archive"
          ? "archived"
          : council.admission === "discovered"
            ? "discovered"
            : council.admission,
    moveTitle: council.move_title,
    purposeLabel: council.purpose_label,
    council,
  };
}

function readDisposition(
  payload: unknown,
  surface: "radar" | "today" | "plan",
): string | undefined {
  if (!isRecord(payload)) return undefined;
  const key = `${surface}_disposition`;
  const topLevel = payload[key];
  if (typeof topLevel === "string") return topLevel;
  const intelligence = isRecord(payload.intelligence) ? payload.intelligence : {};
  const nested = intelligence[key];
  return typeof nested === "string" ? nested : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
