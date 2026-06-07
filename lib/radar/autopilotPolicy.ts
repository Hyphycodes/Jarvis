import {
  RADAR_ACTIVE_ITEM_LIMIT,
  RADAR_MIN_ACTIVE_ITEM_TARGET,
} from "@/lib/brain/constants";
import type { LibraryHealth } from "@/lib/library/types";
import type { RadarCampaign } from "@/lib/radar/campaigns";
import type { RadarCategory } from "@/lib/radar/category";
import { assessBootstrapNeed } from "@/lib/radar/bootstrapPolicy";

export type RadarAutopilotOperation =
  | "front_room_refill"
  | "holding_build"
  | "candidate_inbox_build"
  | "library_build"
  | "library_refresh"
  | "event_pulse_build"
  | "source_recheck"
  | "source_expansion"
  | "weekend_campaign"
  | "after_work_campaign"
  | "circle_event_campaign"
  | "north_priority_campaign"
  | "source_building_campaign"
  | "stale_cleanup"
  | "promotion_review"
  | "foundation_build_mode"
  | "no_op";

export type RadarAutopilotMode =
  | "scheduled"
  | "cron"
  | "manual_force"
  | "owner_requested"
  | "bootstrap"
  | "foundation_sprint";

export type RadarAutopilotHealth = {
  activeCount: number;
  holdingCount: number;
  discoveredBacklogCount: number;
  candidateInboxCount: number;
  sourceCount: number;
  sourcesDue: number;
  library: LibraryHealth;
  eventFreshnessDays: number | null;
  weekendReady: boolean;
  afterWorkReady: boolean;
  circleReady: boolean;
  northReady: boolean;
  /**
   * Visible (shown/opened) count per Radar category. Optional: real autopilot
   * runs populate it (from the active board) to steer discovery toward thin
   * lanes; mocks/legacy callers may omit it, in which case routing falls back
   * to the existing global signals.
   */
  perCategoryActive?: Record<RadarCategory, number>;
};

export function chooseRadarAutopilotOperation(input: {
  health: RadarAutopilotHealth;
  campaigns: RadarCampaign[];
  mode?: RadarAutopilotMode;
}): RadarAutopilotOperation {
  const { health, campaigns } = input;
  const bootstrap = assessBootstrapNeed(health);
  if (input.mode === "bootstrap" || input.mode === "foundation_sprint" || bootstrap.needed) {
    return "foundation_build_mode";
  }
  if (input.mode === "manual_force" && health.activeCount < RADAR_ACTIVE_ITEM_LIMIT) {
    return "promotion_review";
  }
  if (health.activeCount < RADAR_MIN_ACTIVE_ITEM_TARGET) return "front_room_refill";
  if (health.holdingCount < 12) return "holding_build";
  if (health.candidateInboxCount < 30) return "candidate_inbox_build";
  if (health.library.depthScore < 0.42) return "library_build";
  if (health.sourceCount < 8) return "source_building_campaign";
  if (health.sourcesDue > 0) return "source_recheck";
  if ((health.eventFreshnessDays == null || health.eventFreshnessDays > 2) && health.weekendReady) {
    return "event_pulse_build";
  }
  const campaign = campaigns[0];
  if (!campaign) return "no_op";
  switch (campaign.kind) {
    case "weekend_board":
      return "weekend_campaign";
    case "after_work_moves":
      return "after_work_campaign";
    case "circle_moment":
      return "circle_event_campaign";
    case "north_priority":
      return "north_priority_campaign";
    case "source_building":
      return "source_building_campaign";
    default:
      return "no_op";
  }
}
