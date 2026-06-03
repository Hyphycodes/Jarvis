import type { FounderContextPacket } from "@/lib/context/types";
import type { LibraryHealth } from "@/lib/library";

export type RadarCampaignKind =
  | "after_work_moves"
  | "next_48_hours"
  | "weekend_board"
  | "circle_moment"
  | "north_priority"
  | "creative_fuel"
  | "high_quality_rooms"
  | "ownership_money_real_estate"
  | "health_discipline"
  | "source_building"
  | "library_places_build"
  | "library_events_build"
  | "library_sources_build"
  | "recurring_signals_build";

export type RadarCampaign = {
  id: string;
  kind: RadarCampaignKind;
  priority: number;
  reason: string;
  destination: "candidate_inbox" | "library" | "holding" | "active_consideration" | "plan";
  queryIdeas: string[];
  preferredSourceTypes: string[];
  cityScope?: string;
  timeWindow?: string;
  qualityThreshold: number;
  maxCandidates: number;
};

export type CampaignPlannerHealth = {
  activeCount: number;
  holdingCount: number;
  candidateInboxCount: number;
  sourceCount: number;
  eventFreshnessDays?: number | null;
  library: LibraryHealth;
};

export function planRadarCampaigns(input: {
  context: FounderContextPacket;
  health: CampaignPlannerHealth;
  now?: Date;
}): RadarCampaign[] {
  const now = input.now ?? new Date(input.context.now);
  const city = input.context.location.homeCity ?? undefined;
  const campaigns: RadarCampaign[] = [];
  const activePriorities = input.context.north.activePriorities
    .map((priority) => priority.title)
    .filter(Boolean)
    .slice(0, 3);

  if (input.health.sourceCount < 8) {
    campaigns.push(campaign({
      kind: "source_building",
      priority: 95,
      reason: "Source Graph is thin; build where quality comes from before asking Radar to surface more.",
      destination: "candidate_inbox",
      city,
      queryIdeas: activePriorities.map((priority) => `${city ?? ""} ${priority} trusted sources`.trim()),
      preferredSourceTypes: ["domain", "publication", "calendar", "tastemaker"],
      qualityThreshold: 0.5,
      maxCandidates: 20,
    }));
  }

  if (input.health.library.places < 40) {
    campaigns.push(campaign({
      kind: "library_places_build",
      priority: 82,
      reason: "Places Library is not deep enough to support a permanent intelligence bank.",
      destination: "library",
      city,
      queryIdeas: activePriorities.map((priority) => `${city ?? ""} ${priority} places worth researching`.trim()),
      preferredSourceTypes: ["domain", "publication", "venue"],
      qualityThreshold: 0.56,
      maxCandidates: 24,
    }));
  }

  if (input.health.library.events < 15 || isNext48HoursWindow(now)) {
    campaigns.push(campaign({
      kind: "next_48_hours",
      priority: isNext48HoursWindow(now) ? 86 : 72,
      reason: "Event pulse and next-48-hour readiness need fresh candidates.",
      destination: "candidate_inbox",
      city,
      timeWindow: "next_48_hours",
      queryIdeas: [`${city ?? ""} events next 48 hours`.trim()],
      preferredSourceTypes: ["calendar", "organizer", "venue"],
      qualityThreshold: 0.58,
      maxCandidates: 18,
    }));
  }

  if (isWeekendWindow(now)) {
    campaigns.push(campaign({
      kind: "weekend_board",
      priority: 84,
      reason: "Weekend window is close enough to prepare without padding Active Radar.",
      destination: "holding",
      city,
      timeWindow: "weekend",
      queryIdeas: [`${city ?? ""} weekend plans worth considering`.trim()],
      preferredSourceTypes: ["calendar", "publication", "venue"],
      qualityThreshold: 0.62,
      maxCandidates: 16,
    }));
  }

  const circleMoment = input.context.circle.upcomingMoments[0];
  if (circleMoment) {
    campaigns.push(campaign({
      kind: "circle_moment",
      priority: 88,
      reason: `Circle moment needs preparation: ${circleMoment.title}.`,
      destination: "holding",
      city,
      queryIdeas: [circleMoment.suggestedAction ?? circleMoment.title],
      preferredSourceTypes: ["venue", "calendar", "domain"],
      qualityThreshold: 0.62,
      maxCandidates: 10,
    }));
  }

  if (activePriorities.length > 0) {
    campaigns.push(campaign({
      kind: "north_priority",
      priority: 78,
      reason: `North priorities should guide discovery: ${activePriorities.join(", ")}.`,
      destination: "candidate_inbox",
      city,
      queryIdeas: activePriorities.map((priority) => `${city ?? ""} ${priority}`.trim()),
      preferredSourceTypes: ["domain", "publication", "search_pattern"],
      qualityThreshold: 0.6,
      maxCandidates: 14,
    }));
  }

  if (input.context.dayContext.timeOfDay === "afternoon" || input.context.dayContext.timeOfDay === "evening") {
    campaigns.push(campaign({
      kind: "after_work_moves",
      priority: 64,
      reason: "After-work context can inform quiet discovery, but should not force Active Radar.",
      destination: "candidate_inbox",
      city,
      timeWindow: "after_work",
      queryIdeas: [`${city ?? ""} after work events`.trim()],
      preferredSourceTypes: ["calendar", "venue"],
      qualityThreshold: 0.64,
      maxCandidates: 10,
    }));
  }

  return campaigns
    .filter((campaign) => campaign.queryIdeas.length > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
}

function campaign(input: {
  kind: RadarCampaignKind;
  priority: number;
  reason: string;
  destination: RadarCampaign["destination"];
  city?: string;
  timeWindow?: string;
  queryIdeas: string[];
  preferredSourceTypes: string[];
  qualityThreshold: number;
  maxCandidates: number;
}): RadarCampaign {
  return {
    id: `${input.kind}:${new Date().toISOString().slice(0, 10)}`,
    kind: input.kind,
    priority: input.priority,
    reason: input.reason,
    destination: input.destination,
    queryIdeas: input.queryIdeas.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean),
    preferredSourceTypes: input.preferredSourceTypes,
    cityScope: input.city,
    timeWindow: input.timeWindow,
    qualityThreshold: input.qualityThreshold,
    maxCandidates: input.maxCandidates,
  };
}

function isWeekendWindow(now: Date): boolean {
  const day = now.getDay();
  return day === 4 || day === 5 || day === 6;
}

function isNext48HoursWindow(now: Date): boolean {
  const day = now.getDay();
  return day >= 3 && day <= 6;
}
