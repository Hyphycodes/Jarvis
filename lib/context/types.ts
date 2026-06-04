import type { BrainContextPacket } from "@/lib/brain/types";
import type {
  BehaviorSignalContext,
  ChatContextPacket,
  CirclePersonContext,
  ConstraintContext,
  KnownPlaceContext,
  PlanContext,
  PreferenceContext,
  RadarItemContext,
  TodayContext,
} from "@/lib/chat/context/types";
import type { IndexDestination, IndexItemStatus } from "@/lib/index/types";
import type { Json } from "@/lib/types/database";

export type FounderDayContext = {
  weekday: string;
  timeOfDay: "morning" | "afternoon" | "evening" | "overnight";
  workdayLikely?: boolean;
};

export type FounderNorthPillar = {
  id: string;
  title: string;
  description?: string | null;
  progress?: number | null;
  activeSignals: string[];
  updatedAt?: string | null;
};

export type FounderNorthPriority = {
  id: string;
  pillarId?: string | null;
  title: string;
  summary?: string | null;
  action?: string | null;
  source?: string | null;
  createdAt?: string | null;
};

export type FounderRadarItem = {
  id: string;
  title: string;
  category?: string | null;
  type?: string | null;
  status: IndexItemStatus;
  destination?: IndexDestination | string | null;
  planningState?: string | null;
  tasteFitSummary?: string | null;
  reasons: string[];
  tags: string[];
  score?: number | null;
  startsAt?: string | null;
  updatedAt?: string | null;
};

export type FounderPlanItem = {
  id: string;
  title: string;
  status: string;
  buildStatus?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  summary?: string | null;
  liveEnabled?: boolean;
  updatedAt?: string | null;
};

export type FounderTodayItem = {
  id: string;
  title: string;
  status?: string | null;
  time?: string | null;
  planId?: string | null;
  details?: string | null;
  startsAt?: string | null;
  source?: "timeline" | "surfaced_item" | "circle" | "plan";
};

export type FounderKnownPlace = {
  name: string;
  slug: string;
  placeType: string | null;
  neighborhood: string | null;
  cuisineOrFocus: string | null;
  priceLevel: string | null;
  vibeKeywords: string[];
  verdict: string | null;
  verdictStrength: number | null;
  bestFor: string[];
};

export type FounderCirclePerson = {
  id: string;
  name: string;
  category: string;
  role?: string | null;
  closenessScore: number;
  lastInteraction?: string | null;
  nextAction?: string | null;
  currentThread?: string | null;
  neighborhood?: string | null;
  notes: string[];
};

export type FounderCircleMoment = {
  id: string;
  personId?: string | null;
  title: string;
  summary?: string | null;
  suggestedAction?: string | null;
  urgency?: string | null;
  source?: string | null;
  createdAt?: string | null;
};

export type FounderMemorySignal = {
  id: string;
  content: string;
  kind: string;
  confidence: number;
  source?: string | null;
  tags: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type FounderBehaviorSignal = {
  signalType: string;
  subjectId?: string | null;
  objectType?: string | null;
  objectId?: string | null;
  metadata?: Json;
  payload?: Json;
  createdAt: string;
};

export type FounderBehaviorPattern = {
  key: string;
  label: string;
  count: number;
  examples: string[];
};

export type FounderWeeklyRhythm = {
  enabled: boolean;
  workdays: string[];
  leaveHome: string;
  workStart: string;
  leaveWork: string;
  arriveHome: string;
  workLocation: string;
  timezone: string;
};

export type FounderLocationContext = {
  homeCity?: string | null;
  homeState?: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
};

export type FounderWeatherContext = {
  temperatureF: number;
  windMph: number;
  weatherCode: number;
};

export type FounderContextPacket = {
  userId: string;
  now: string;
  timezone: string;
  dayContext: FounderDayContext;
  location: FounderLocationContext;
  weather?: FounderWeatherContext | null;
  founder: {
    displayName?: string | null;
    lifeDirection?: string | null;
    currentFocus?: string | null;
    vibeKeywords: string[];
    avoidKeywords: string[];
    dealbreakers: string[];
    pinnedPrinciples: string[];
    weeklyRhythm?: FounderWeeklyRhythm | null;
  };
  north: {
    pillars: FounderNorthPillar[];
    activePriorities: FounderNorthPriority[];
    tags: string[];
  };
  radar: {
    current: FounderRadarItem[];
    recentlySaved: FounderRadarItem[];
    recentlyPassed: FounderRadarItem[];
    patterns: FounderBehaviorPattern[];
  };
  today: {
    upcomingItems: FounderTodayItem[];
    activePlan?: FounderPlanItem | null;
    activePlans: FounderPlanItem[];
  };
  circle: {
    upcomingMoments: FounderCircleMoment[];
    relevantPeople: FounderCirclePerson[];
  };
  knownPlaces: FounderKnownPlace[];
  memory: {
    stablePreferences: FounderMemorySignal[];
    recentSignals: FounderMemorySignal[];
  };
  behavior: {
    recentSignals: FounderBehaviorSignal[];
    recentItemActions: FounderRadarItem[];
    savePatterns: FounderBehaviorPattern[];
    passPatterns: FounderBehaviorPattern[];
    planPatterns: FounderBehaviorPattern[];
  };
};

export type NorthAlignment = {
  score: number;
  matchedPillars: string[];
  reason: string;
};

export function deriveDayContext(input: {
  now: Date;
  timezone?: string | null;
  workdays?: string[];
  weeklyRhythmEnabled?: boolean;
}): FounderDayContext {
  const timezone = input.timezone || "UTC";
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: timezone,
  }).format(input.now);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(input.now),
  );
  const timeOfDay =
    hour < 5 ? "overnight" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const workdayLikely =
    input.weeklyRhythmEnabled && input.workdays
      ? input.workdays.map((day) => day.toLowerCase()).includes(weekday.toLowerCase())
      : undefined;

  return { weekday, timeOfDay, workdayLikely };
}

export function summarizeBehaviorPatterns(
  actions: Array<{ title?: string | null; category?: string | null; type?: string | null }>,
): FounderBehaviorPattern[] {
  const buckets = new Map<string, { label: string; count: number; examples: string[] }>();
  for (const action of actions) {
    const label = cleanPatternLabel(action.category ?? action.type ?? "uncategorized");
    const key = slug(label);
    const current = buckets.get(key) ?? { label, count: 0, examples: [] };
    current.count += 1;
    if (action.title && current.examples.length < 3) current.examples.push(action.title);
    buckets.set(key, current);
  }
  return Array.from(buckets.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function computeNorthAlignment(input: {
  itemTags?: string[];
  itemText?: string;
  northTags?: string[];
  pillars?: Array<{ title: string; activeSignals?: string[] }>;
}): NorthAlignment {
  const northTags = unique([
    ...(input.northTags ?? []),
    ...(input.pillars ?? []).flatMap((pillar) => [
      pillar.title,
      ...(pillar.activeSignals ?? []),
    ]),
  ])
    .map((value) => value.trim())
    .filter(Boolean);

  if (northTags.length === 0) {
    return { score: 0, matchedPillars: [], reason: "No North priorities available." };
  }

  const itemTokens = new Set([
    ...(input.itemTags ?? []).flatMap(tokenVariants),
    ...tokenVariants(input.itemText ?? ""),
  ]);
  const matched = unique(
    northTags.filter((tag) => tokenVariants(tag).some((token) => itemTokens.has(token))),
  );

  if (matched.length === 0) {
    return { score: 0, matchedPillars: [], reason: "No active North priority matched." };
  }

  const score = Math.min(1, 0.45 + matched.length * 0.15);
  return {
    score,
    matchedPillars: matched.slice(0, 5),
    reason: `Matched North: ${matched.slice(0, 3).join(", ")}`,
  };
}

export function toBrainContextPacket(packet: FounderContextPacket): BrainContextPacket {
  const activePlan = packet.today.activePlan ?? packet.today.activePlans[0] ?? null;
  return {
    now: packet.now,
    homeCity: packet.location.homeCity ?? undefined,
    homeState: packet.location.homeState ?? undefined,
    homeLat: packet.location.homeLat ?? undefined,
    homeLng: packet.location.homeLng ?? undefined,
    founder: {
      displayName: packet.founder.displayName ?? null,
      homeCity: packet.location.homeCity ?? null,
      timezone: packet.timezone,
      lifeDirection: packet.founder.lifeDirection ?? null,
      currentFocus: packet.founder.currentFocus ?? null,
      vibeKeywords: packet.founder.vibeKeywords,
      avoidKeywords: packet.founder.avoidKeywords,
      dealbreakers: packet.founder.dealbreakers,
      pinnedPrinciples: packet.founder.pinnedPrinciples,
    },
    memory: packet.memory.stablePreferences.map((memory) => ({
      content: memory.content,
      kind: memory.kind,
      confidence: memory.confidence,
    })),
    recentSignals: packet.behavior.recentSignals.map((signal) => ({
      signal_type: signal.signalType,
      subject_id: signal.subjectId ?? null,
      created_at: signal.createdAt,
    })),
    recentActions: packet.behavior.recentItemActions.map((action) => ({
      title: action.title || "(untitled)",
      status: action.status,
      category: action.category,
    })),
    northTags: packet.north.tags,
    northPillars: packet.north.pillars.map((pillar) => ({
      id: pillar.id,
      title: pillar.title,
      progress: pillar.progress ?? null,
    })),
    weather: packet.weather ?? null,
    activePlan: activePlan
      ? {
          id: activePlan.id,
          title: activePlan.title,
          summary: activePlan.summary ?? null,
          liveEnabled: Boolean(activePlan.liveEnabled),
        }
      : null,
    weeklyRhythm: packet.founder.weeklyRhythm ?? undefined,
    people: packet.circle.relevantPeople.map((person) => {
      const recentUpdate = packet.circle.upcomingMoments.find((moment) => moment.personId === person.id);
      return {
        name: person.name,
        relationship: person.role ?? null,
        category: person.category,
        last_interaction: person.lastInteraction ?? null,
        notable_traits: person.notes,
        recent_update: recentUpdate
          ? {
              title: recentUpdate.title,
              summary: recentUpdate.summary ?? "",
              urgency: recentUpdate.urgency ?? "normal",
            }
          : null,
      };
    }),
  };
}

export function toChatContextPacket(packet: FounderContextPacket): ChatContextPacket {
  const today: TodayContext = {
    isoDate: packet.now,
    localDateLabel: new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeZone: packet.timezone,
    }).format(new Date(packet.now)),
    timezone: packet.timezone,
    homeCity: packet.location.homeCity ?? null,
    weather: packet.weather ?? null,
  };

  const preferences: PreferenceContext[] = packet.memory.stablePreferences.map((memory) => ({
    content: memory.content,
    kind: memory.kind,
    confidence: memory.confidence,
    category: memory.tags[0] ?? null,
    direction: memory.kind === "avoidance" ? "negative" : null,
  }));

  const activePlans: PlanContext[] = packet.today.activePlans.map((plan) => ({
    id: plan.id,
    title: plan.title,
    status: plan.status,
    buildStatus: plan.buildStatus ?? null,
    scheduledDate: plan.scheduledDate ?? null,
    scheduledTime: plan.scheduledTime ?? null,
    summary: plan.summary ?? null,
  }));

  const radar: RadarItemContext[] = packet.radar.current.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category ?? null,
    status: item.status,
    planningState: item.planningState ?? null,
    tasteFitSummary: item.tasteFitSummary ?? null,
    reasons: item.reasons,
  }));

  const circle: CirclePersonContext[] = packet.circle.relevantPeople.map((person) => ({
    id: person.id,
    name: person.name,
    category: person.category,
    role: person.role ?? null,
    closenessScore: person.closenessScore,
    lastInteraction: person.lastInteraction ?? null,
    notes: person.notes,
  }));

  const recentSignals: BehaviorSignalContext[] = packet.behavior.recentSignals.map((signal) => ({
    signalType: signal.signalType,
    subjectId: signal.subjectId ?? null,
    objectType: signal.objectType ?? null,
    objectId: signal.objectId ?? null,
    createdAt: signal.createdAt,
  }));

  const knownPlaces: KnownPlaceContext[] = packet.knownPlaces.map((place) => ({
    name: place.name,
    slug: place.slug,
    placeType: place.placeType ?? null,
    neighborhood: place.neighborhood ?? null,
    cuisineOrFocus: place.cuisineOrFocus ?? null,
    priceLevel: place.priceLevel ?? null,
    vibeKeywords: place.vibeKeywords,
    verdict: place.verdict ?? null,
    verdictStrength: place.verdictStrength ?? null,
    bestFor: place.bestFor,
  }));

  return {
    today,
    user: {
      displayName: packet.founder.displayName ?? null,
      homeCity: packet.location.homeCity ?? null,
      lifeDirection: packet.founder.lifeDirection ?? null,
      currentFocus: packet.founder.currentFocus ?? null,
      vibeKeywords: packet.founder.vibeKeywords,
      avoidKeywords: packet.founder.avoidKeywords,
      dealbreakers: packet.founder.dealbreakers,
      pinnedPrinciples: packet.founder.pinnedPrinciples,
    },
    activePlans,
    radar,
    circle,
    preferences,
    recentSignals,
    constraints: constraintsFromPacket(packet),
    knownPlaces,
  };
}

function constraintsFromPacket(packet: FounderContextPacket): ConstraintContext[] {
  const constraints: ConstraintContext[] = [];
  for (const value of packet.founder.dealbreakers.slice(0, 8)) {
    constraints.push({ type: "avoidance", summary: value, source: "founder_profile.dealbreakers" });
  }
  for (const value of packet.founder.avoidKeywords.slice(0, 8)) {
    constraints.push({ type: "taste", summary: `Avoid ${value}`, source: "founder_profile.avoid_keywords" });
  }
  if (packet.location.homeCity) {
    constraints.push({
      type: "location",
      summary: `Home base: ${packet.location.homeCity}`,
      source: "profile.location",
    });
  }
  if (packet.founder.weeklyRhythm?.enabled) {
    constraints.push({
      type: "schedule",
      summary: `Saved work rhythm: ${packet.founder.weeklyRhythm.workdays.join(", ")}`,
      source: "founder_profile.weekly_rhythm",
    });
  }
  return constraints;
}

function cleanPatternLabel(value: string): string {
  return value.replace(/[_-]+/g, " ").trim() || "uncategorized";
}

function tokenVariants(value: string): string[] {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!cleaned) return [];
  const words = cleaned.split(/\s+/).filter((word) => word.length >= 3);
  return unique([cleaned.replace(/\s+/g, "_"), ...words]);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}
