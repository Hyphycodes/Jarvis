import type { RadarAutopilotHealth, RadarAutopilotOperation } from "@/lib/radar/autopilotPolicy";
import { RADAR_MIN_ACTIVE_ITEM_TARGET } from "@/lib/brain/constants";
import { RADAR_CATEGORIES, type RadarCategory } from "@/lib/radar/category";
import { surfaceTargetFor } from "@/lib/radar/inventoryTargets";
import type { SourceHealth } from "@/lib/sources/types";

export const FOUNDATION_SPRINT_TARGETS = {
  places: 1000,
  activeEvents: 500,
  sources: 500,
  candidateInbox: 2000,
  tierAPlusB: 300,
  recurringSignals: 200,
  tastemakers: 200,
  organizations: 200,
  neighborhoods: 50,
} as const;

export const FOUNDATION_BATCH_BUDGET = {
  maxProviderCalls: 3,
  maxCandidatesCreated: 35,
  maxSourcesCreated: 15,
  maxLibraryItemsCreated: 12,
  maxEventsCreated: 15,
  maxOperations: 3,
} as const;

export const DEFAULT_RUN_BUDGET_MS = 35_000;
export const FOUNDATION_RUN_BUDGET_MS = 45_000;
export const RUN_BUDGET_STOP_BUFFER_MS = 5_000;
export const FOUNDATION_PROMOTION_RESERVE_MS = 12_000;
export const FOUNDATION_CANDIDATE_INBOX_NEAR_TARGET_RATIO = 0.9;

export type RunBudget = {
  startedAt: number;
  deadlineAt: number;
  maxMs: number;
  timeRemainingMs: () => number;
  shouldStopSoon: () => boolean;
};

export function createRunBudget(maxMs: number, now: () => number = Date.now): RunBudget {
  const startedAt = now();
  const deadlineAt = startedAt + maxMs;
  return {
    startedAt,
    deadlineAt,
    maxMs,
    timeRemainingMs: () => deadlineAt - now(),
    shouldStopSoon: () => now() >= deadlineAt - RUN_BUDGET_STOP_BUFFER_MS,
  };
}

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
  const incomplete = FOUNDATION_COMPLETION_KEYS.some((key) => progress[key].current < progress[key].target)
    || health.activeCount < RADAR_MIN_ACTIVE_ITEM_TARGET
    || health.discoveredBacklogCount > 0;
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
  const runnable = rotated
    .filter((mission) => isMissionTargetReady(mission, input.health))
    .filter((mission) => hasProviderSupport(mission, input.providerStatus) || mission.type === "candidate_evaluation" || mission.type === "library_conversion" || mission.type === "holding_promotion_review");
  const promotion = mission("holding_promotion_review");
  const withoutPromotion = runnable.filter((entry) => entry.type !== promotion.type);
  const selected = [promotion, ...withoutPromotion].filter(uniqueMission);
  return selected.slice(0, max);
}

export function missionProviderBlockReason(mission: FoundationMission, status: SourceHealth): string | null {
  if (!mission.requiresProvider?.length) return null;
  if (hasProviderSupport(mission, status)) return null;
  return `Mission ${mission.type} blocked: none of ${mission.requiresProvider.join(", ")} are configured.`;
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

/**
 * The discovery mission that best feeds each visible Radar lane. Used to steer
 * discovery toward thin lanes (culture/moves/events) instead of letting the
 * neighborhood/place missions keep over-filling dining. Finds flow through a
 * separate product pipeline (need_scout / finds/scout), so it has no feeder.
 */
const CATEGORY_FEEDER_MISSION: Partial<Record<RadarCategory, FoundationMissionType>> = {
  culture: "music_culture_creative_fuel",
  moves: "sports_activity",
  events: "events_next_7_days",
  dining: "new_restaurant_openings",
  places: "gold_coast_drift",
};

/** Feeder missions for visible lanes below their surface target, thinnest first. */
function thinLaneMissions(health: RadarAutopilotHealth): FoundationMission[] {
  const perCategory = health.perCategoryActive;
  if (!perCategory) return [];
  return RADAR_CATEGORIES
    .map((category) => ({ category, gap: surfaceTargetFor(category) - (perCategory[category] ?? 0) }))
    .filter((entry) => entry.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .map((entry) => CATEGORY_FEEDER_MISSION[entry.category])
    .filter((type): type is FoundationMissionType => Boolean(type))
    .map((type) => mission(type));
}

function prioritizedMissions(health: RadarAutopilotHealth): FoundationMission[] {
  const missions: FoundationMission[] = [];
  missions.push(mission("holding_promotion_review"));
  if (health.candidateInboxCount > 0) missions.push(mission("library_conversion"));
  // Feed thin visible lanes before the generic place/event builders so culture,
  // moves, and events catch up instead of dining/places running away.
  missions.push(...thinLaneMissions(health));
  if (health.library.places < FOUNDATION_SPRINT_TARGETS.places && !isCandidateInboxNearTarget(health)) missions.push(mission("new_restaurant_openings"));
  if (health.library.events < FOUNDATION_SPRINT_TARGETS.activeEvents && !isCandidateInboxNearTarget(health)) missions.push(mission("events_next_7_days"));
  if (health.sourceCount < FOUNDATION_SPRINT_TARGETS.sources) missions.push(mission("source_building"));
  if (health.sourcesDue > 0) missions.push(mission("source_recheck"));
  return missions;
}

export function isCandidateInboxNearTarget(health: Pick<RadarAutopilotHealth, "candidateInboxCount">): boolean {
  return health.candidateInboxCount >= FOUNDATION_SPRINT_TARGETS.candidateInbox * FOUNDATION_CANDIDATE_INBOX_NEAR_TARGET_RATIO;
}

function isMissionTargetReady(mission: FoundationMission, health: RadarAutopilotHealth): boolean {
  if (mission.type === "holding_promotion_review") return true;
  if (mission.operation === "candidate_inbox_build") return !isCandidateInboxNearTarget(health);
  if (mission.operation === "event_pulse_build") return health.library.events < FOUNDATION_SPRINT_TARGETS.activeEvents && !isCandidateInboxNearTarget(health);
  if (mission.type === "source_building") return health.sourceCount < FOUNDATION_SPRINT_TARGETS.sources;
  if (mission.type === "library_conversion") return health.candidateInboxCount > 0;
  if (mission.type === "source_recheck") return health.sourcesDue > 0;
  if (health.activeCount < RADAR_MIN_ACTIVE_ITEM_TARGET) return true;
  return true;
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
