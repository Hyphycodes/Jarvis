import type { RadarAutopilotHealth, RadarAutopilotOperation } from "@/lib/radar/autopilotPolicy";
import type { SourceHealth } from "@/lib/sources/types";

export const FOUNDATION_SPRINT_TARGETS = {
  places: 300,
  activeEvents: 150,
  sources: 100,
  candidateInbox: 500,
  tierAPlusB: 75,
  recurringSignals: 50,
  tastemakers: 50,
  organizations: 50,
  neighborhoods: 15,
} as const;

export const FOUNDATION_BATCH_BUDGET = {
  maxProviderCalls: 8,
  maxCandidatesCreated: 75,
  maxSourcesCreated: 30,
  maxLibraryItemsCreated: 30,
  maxEventsCreated: 30,
  maxOperations: 3,
} as const;

export type FoundationMissionType =
  | "taste_seed_verify"
  | "source_building"
  | "new_restaurant_openings"
  | "events_next_7_days"
  | "events_next_30_days"
  | "gold_coast_drift"
  | "lincoln_park_daytime"
  | "fulton_market_food_culture"
  | "logan_square_low_pressure"
  | "bolingbrook_naperville_activity"
  | "music_culture_creative_fuel"
  | "family_social_community"
  | "sports_activity"
  | "cigar_lounge_dessert_drift"
  | "recurring_signals"
  | "candidate_evaluation"
  | "library_conversion"
  | "source_recheck"
  | "holding_promotion_review";

export type FoundationMission = {
  type: FoundationMissionType;
  operation: RadarAutopilotOperation;
  reason: string;
  requiresProvider?: Array<keyof SourceHealth>;
};

export type FoundationSprintAssessment = {
  active: boolean;
  completed: boolean;
  reason: string;
  progress: Record<keyof typeof FOUNDATION_SPRINT_TARGETS, { current: number; target: number }>;
};

const MISSION_PLAN: FoundationMission[] = [
  { type: "taste_seed_verify", operation: "candidate_inbox_build", reason: "Verify imported taste context and seed raw intake." },
  { type: "source_building", operation: "source_building_campaign", reason: "Build and test source graph depth.", requiresProvider: ["tavily", "google-places", "ticketmaster"] },
  { type: "new_restaurant_openings", operation: "candidate_inbox_build", reason: "Gather new place candidates from configured providers.", requiresProvider: ["google-places", "tavily"] },
  { type: "events_next_7_days", operation: "event_pulse_build", reason: "Build near-term event pulse.", requiresProvider: ["ticketmaster", "tavily"] },
  { type: "events_next_30_days", operation: "event_pulse_build", reason: "Build forward event inventory.", requiresProvider: ["ticketmaster", "tavily"] },
  { type: "gold_coast_drift", operation: "candidate_inbox_build", reason: "Taste-guided neighborhood drift mission.", requiresProvider: ["google-places", "tavily"] },
  { type: "lincoln_park_daytime", operation: "candidate_inbox_build", reason: "Taste-guided daytime/place mission.", requiresProvider: ["google-places", "tavily"] },
  { type: "fulton_market_food_culture", operation: "candidate_inbox_build", reason: "Food/culture source mission.", requiresProvider: ["google-places", "tavily"] },
  { type: "logan_square_low_pressure", operation: "candidate_inbox_build", reason: "Low-pressure social place mission.", requiresProvider: ["google-places", "tavily"] },
  { type: "bolingbrook_naperville_activity", operation: "candidate_inbox_build", reason: "Local activity and movement mission.", requiresProvider: ["google-places", "tavily"] },
  { type: "music_culture_creative_fuel", operation: "candidate_inbox_build", reason: "Creative/culture discovery mission.", requiresProvider: ["ticketmaster", "tavily"] },
  { type: "family_social_community", operation: "candidate_inbox_build", reason: "Circle-aware social/community mission.", requiresProvider: ["ticketmaster", "tavily"] },
  { type: "sports_activity", operation: "candidate_inbox_build", reason: "Movement/activity discovery mission.", requiresProvider: ["google-places", "ticketmaster"] },
  { type: "cigar_lounge_dessert_drift", operation: "candidate_inbox_build", reason: "Drift anchor discovery mission.", requiresProvider: ["google-places", "tavily"] },
  { type: "recurring_signals", operation: "source_building_campaign", reason: "Find sources that can be rechecked repeatedly.", requiresProvider: ["tavily", "brave", "serpapi"] },
  { type: "candidate_evaluation", operation: "library_build", reason: "Evaluate raw Candidate Inbox inventory." },
  { type: "library_conversion", operation: "library_build", reason: "Convert strong raw candidates into durable Library rows." },
  { type: "source_recheck", operation: "source_recheck", reason: "Recheck due strong sources." },
  { type: "holding_promotion_review", operation: "promotion_review", reason: "Conservative final review for timely strong items." },
];

const FOUNDATION_COMPLETION_KEYS: Array<keyof typeof FOUNDATION_SPRINT_TARGETS> = [
  "places",
  "activeEvents",
  "sources",
  "candidateInbox",
  "tierAPlusB",
  "tastemakers",
];

export function assessFoundationSprint(health: RadarAutopilotHealth): FoundationSprintAssessment {
  const current = {
    places: health.library.places,
    activeEvents: health.library.events,
    sources: health.sourceCount,
    candidateInbox: health.candidateInboxCount,
    tierAPlusB: health.library.tierA + health.library.tierB,
    recurringSignals: health.library.recurringSignals,
    tastemakers: health.library.people,
    organizations: health.library.organizations,
    neighborhoods: 0,
  } satisfies Record<keyof typeof FOUNDATION_SPRINT_TARGETS, number>;
  const progress = Object.fromEntries(
    (Object.keys(FOUNDATION_SPRINT_TARGETS) as Array<keyof typeof FOUNDATION_SPRINT_TARGETS>)
      .map((key) => [key, { current: current[key], target: FOUNDATION_SPRINT_TARGETS[key] }]),
  ) as FoundationSprintAssessment["progress"];
  const incomplete = FOUNDATION_COMPLETION_KEYS.some((key) => progress[key].current < progress[key].target);
  return {
    active: incomplete,
    completed: !incomplete,
    reason: incomplete ? "Foundation Sprint targets are still thin." : "Foundation Sprint targets are healthy.",
    progress,
  };
}

export function selectFoundationMissions(input: {
  health: RadarAutopilotHealth;
  providerStatus: SourceHealth;
  cursor?: number | null;
  maxOperations?: number;
}): FoundationMission[] {
  const max = input.maxOperations ?? FOUNDATION_BATCH_BUDGET.maxOperations;
  if (assessFoundationSprint(input.health).completed) return [];
  const priority = prioritizedMissions(input.health);
  const start = Math.max(0, input.cursor ?? 0);
  const ordered = [...priority, ...MISSION_PLAN].filter(uniqueMission);
  const rotated = [...ordered.slice(start % ordered.length), ...ordered.slice(0, start % ordered.length)];
  return rotated
    .filter((mission) => hasProviderSupport(mission, input.providerStatus) || mission.type === "candidate_evaluation" || mission.type === "library_conversion" || mission.type === "holding_promotion_review")
    .slice(0, max);
}

export function nextMissionCursor(current: number | null | undefined, ran: number): number {
  if (MISSION_PLAN.length === 0) return 0;
  return ((current ?? 0) + Math.max(1, ran)) % MISSION_PLAN.length;
}

export function foundationWorkDone(input: {
  candidates: number;
  sources: number;
  library: number;
  events: number;
  held: number;
  promoted: number;
  checked: number;
}): boolean {
  return Object.values(input).some((value) => value > 0);
}

function prioritizedMissions(health: RadarAutopilotHealth): FoundationMission[] {
  const missions: FoundationMission[] = [];
  if (health.candidateInboxCount > 0) missions.push(mission("library_conversion"));
  if (health.library.places < FOUNDATION_SPRINT_TARGETS.places) missions.push(mission("new_restaurant_openings"));
  if (health.library.events < FOUNDATION_SPRINT_TARGETS.activeEvents) missions.push(mission("events_next_7_days"));
  if (health.sourceCount < FOUNDATION_SPRINT_TARGETS.sources) missions.push(mission("source_building"));
  if (health.sourcesDue > 0) missions.push(mission("source_recheck"));
  return missions;
}

function mission(type: FoundationMissionType): FoundationMission {
  return MISSION_PLAN.find((entry) => entry.type === type) ?? MISSION_PLAN[0];
}

function uniqueMission(value: FoundationMission, index: number, array: FoundationMission[]): boolean {
  return array.findIndex((entry) => entry.type === value.type) === index;
}

function hasProviderSupport(mission: FoundationMission, status: SourceHealth): boolean {
  if (!mission.requiresProvider?.length) return true;
  return mission.requiresProvider.some((provider) => status[provider] === "available");
}
