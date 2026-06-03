import type { ExplorationLane } from "@/lib/brain/tasteStrategist";

export type ScoutMissionDestination =
  | "radar"
  | "today"
  | "plan"
  | "library"
  | "event_pulse"
  | "holding"
  | "north"
  | "discovered";

export type ScoutMission = {
  id: string;
  lane: string;
  intent: string;
  destination: ScoutMissionDestination;
  queryIdeas: string[];
  sourceStrategy?: string[];
  domains?: string[];
  locationScope?: string;
  urgency?: string;
  effort?: string;
  spendingPosture?: string;
  confidence?: number;
  contextReason?: string;
  seed?: boolean;
};

export type StaticScoutSeed = {
  q: string;
  domains: string[];
  chicagoOnly?: boolean;
};

export function buildScoutMissions(input: {
  lanes: ExplorationLane[];
  city?: string | null;
  year?: number;
  staticSeeds?: StaticScoutSeed[];
  allowStaticFallback?: boolean;
  minMissionCount?: number;
}): ScoutMission[] {
  const year = input.year ?? new Date().getFullYear();
  const city = input.city?.trim() || null;
  const laneMissions = input.lanes
    .map((lane) => missionFromLane(lane, city, year))
    .filter((mission): mission is ScoutMission => Boolean(mission));

  const minMissionCount = input.minMissionCount ?? 1;
  if (laneMissions.length >= minMissionCount || !input.allowStaticFallback) {
    return laneMissions;
  }

  return [
    ...laneMissions,
    ...staticSeedMissions({
      seeds: input.staticSeeds ?? [],
      city,
      year,
      needed: Math.max(0, minMissionCount - laneMissions.length),
    }),
  ];
}

export function missionFromLane(
  lane: ExplorationLane,
  city: string | null,
  year: number,
): ScoutMission | null {
  const queryIdeas = lane.query_ideas
    .map((query) => renderMissionQuery(query, city, year))
    .filter(Boolean)
    .slice(0, 6);
  if (queryIdeas.length === 0) return null;

  return {
    id: lane.id,
    lane: lane.interest_area,
    intent: lane.title,
    destination: mapDestination(lane.suggested_destination),
    queryIdeas,
    sourceStrategy: lane.source_strategy,
    domains: city && isChicagoLike(city) ? lane.preferred_domains : undefined,
    locationScope: city ?? undefined,
    urgency: lane.urgency,
    effort: lane.effort_level,
    spendingPosture: lane.spending_posture,
    confidence: lane.confidence,
    contextReason: [lane.why_it_fits, lane.why_now].filter(Boolean).join(" | "),
  };
}

export function staticSeedMissions(input: {
  seeds: StaticScoutSeed[];
  city: string | null;
  year: number;
  needed: number;
}): ScoutMission[] {
  if (!input.city || input.needed <= 0) return [];
  return input.seeds
    .filter((seed) => isChicagoLike(input.city) || !seed.chicagoOnly)
    .slice(0, input.needed)
    .map((seed, index) => ({
      id: `seed:${index}:${slug(seed.q)}`,
      lane: "static_seed",
      intent: "Gated scout seed",
      destination: "library",
      queryIdeas: [renderMissionQuery(seed.q, input.city, input.year)],
      domains: isChicagoLike(input.city) ? seed.domains : undefined,
      locationScope: input.city ?? undefined,
      confidence: 0.35,
      contextReason: "Static seed used only because strategist missions were insufficient.",
      seed: true,
    }));
}

export function renderMissionQuery(
  query: string,
  city: string | null,
  year: number,
): string {
  return query
    .replace(/\{city\}/g, city ?? "")
    .replace(/\{year\}/g, String(year))
    .replace(/\s+/g, " ")
    .trim();
}

export function isChicagoLike(city: string | null | undefined): boolean {
  return Boolean(city && /chicago/i.test(city));
}

function mapDestination(destination: ExplorationLane["suggested_destination"]): ScoutMissionDestination {
  return destination;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
