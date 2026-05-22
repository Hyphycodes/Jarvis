import type { MemoryUpdateProposal, MemoryItem } from "@/lib/memory/types";

export type IntelligenceDestination =
  | "today.hero"
  | "today.timeline"
  | "today.grabList"
  | "today.livePlan"
  | "radar.feed"
  | "radar.saved"
  | "radar.passed"
  | "circle.person"
  | "circle.update"
  | "north.goal"
  | "north.pillar"
  | "plan.detail"
  | "memory.taste"
  | "memory.relationship"
  | "memory.preference"
  | "notification";

export type IntelligenceSource =
  | "ai"
  | "memory"
  | "directory"
  | "research"
  | "manual"
  | "system";

export type RoutedIntelligence<TPayload = unknown> = {
  id: string;
  destination: IntelligenceDestination;
  priority: number;
  confidence: number;
  expiresAt?: string;
  payload: TPayload;
  reason: string;
  source: IntelligenceSource;
  createdAt: string;
};

export type NormalizedCandidate = {
  id: string;
  source: "directory" | "research" | "calendar" | "contacts" | "memory" | "manual";
  kind:
    | "place"
    | "event"
    | "person"
    | "calendar_event"
    | "task"
    | "memory_signal"
    | "weather_signal"
    | "route_signal"
    | "north_goal";
  title: string;
  subtitle?: string;
  description?: string;
  datetime?: string;
  location?: {
    name?: string;
    address?: string;
    lat?: number;
    lng?: number;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  tags: string[];
  raw?: unknown;
};

export type TodayPayload = {
  hero: {
    eyebrow: string;
    date: string;
    greeting: string;
    summary: string;
    primaryPlanId?: string;
    leaveBy?: string;
  };
  timeline: TodayTimelineItem[];
  grabList: GrabListItem[];
  livePlan?: {
    planId: string;
    label: "LIVE" | "BEGIN" | "UPCOMING";
    enabled: boolean;
    title?: string;
    slug?: string;
    status?: string;
    summary?: string;
    timeWindow?: string;
    locationLine?: string;
    sourceItemType?: string;
    destination?: string;
    nextTimelineItem?: {
      time: string;
      title: string;
    };
  };
  /** Day-of items whose starts_at is today but that may live elsewhere
   *  (Upcoming/Holding/Radar). Surfaced read-only; promotion to
   *  destination="today" is manual via POST /api/today/promote. */
  onDeck?: OnDeckItem[];
  /** Count of items in Upcoming, for the small entry link. */
  upcomingCount?: number;
  nextMove?: TodayCommandItem;
  todayStack?: TodayCommandItem[];
  upcoming?: TodayCommandItem[];
};

export type TodayCommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  summary?: string;
  source?: string;
  type?: string;
  category?: string;
  destination: string;
  status: string;
  startsAt?: string;
  locationName?: string;
  planId?: string;
  planSlug?: string;
  reason?: string;
  score?: number;
};

export type OnDeckItem = {
  id: string;
  title: string;
  subtitle?: string;
  startsAt?: string;
  locationName?: string;
  category?: string;
  planId?: string;
};

export type TodayTimelineItem = {
  id: string;
  time: string;
  title: string;
  status: "pending" | "active" | "done" | "skipped";
  planId?: string;
  planSlug?: string;
  expandable: boolean;
  details?: string;
  locationLine?: string;
};

export type GrabListItem = {
  id: string;
  label: string;
  checked: boolean;
  sourcePlanId?: string;
};

export type RadarCard = {
  id: string;
  source?: string;
  type?: string;
  status?: string;
  destination?: string;
  planSlug?: string;
  category:
    | "dining"
    | "events"
    | "culture"
    | "places"
    | "sports"
    | "music"
    | "travel"
    | "style"
    | "opportunity";
  title: string;
  summary: string;
  displayCategory?: string;
  oneLine?: string;
  jarvisTake?: string;
  verdictLabel?: string;
  verdictTone?: "positive" | "neutral" | "caution" | "negative";
  bestMoveTitle?: string;
  bestNextAction?: string;
  confidenceLabel?: "low" | "medium" | "high";
  effortLevel?: "low" | "medium" | "high";
  spendingPosture?: "free" | "low" | "paid" | "high" | "unknown";
  evidenceSummary?: string;
  cleanedTags?: string[];
  sourceDomain?: string;
  locationLabel?: string;
  neighborhood?: string;
  datetime?: string;
  imageUrl?: string;
  score: number;
  whyItFits: string;
  whyNow: string;
  actions: {
    save: boolean;
    pass: boolean;
    openPlan: boolean;
  };
  routeOnSave: IntelligenceDestination[];
  routeOnPass: IntelligenceDestination[];
};

export type CirclePerson = {
  id: string;
  name: string;
  category:
    | "homies"
    | "real_estate"
    | "creatives"
    | "faith"
    | "italy"
    | "family"
    | "business";
  role?: string;
  closenessScore: number;
  lastInteraction?: string;
  nextAction?: string;
  currentThread?: string;
  notes: string[];
};

export type CircleUpdate = {
  id: string;
  personId: string;
  title: string;
  summary: string;
  suggestedAction?: string;
  urgency: "low" | "medium" | "high";
  source: "manual" | "calendar" | "message" | "memory" | "ai";
  createdAt: string;
};

export type NorthPayload = {
  northStar: {
    title: string;
    subtitle: string;
    headingDegrees?: number;
  };
  pillars: NorthPillar[];
  signals: NorthSignal[];
};

export type NorthPillar = {
  id: string;
  title: string;
  description: string;
  progress?: number;
  activeSignals: string[];
};

export type NorthSignal = {
  id: string;
  pillarId: string;
  title: string;
  summary: string;
  action?: string;
  source: "memory" | "radar" | "manual" | "plan" | "reflection";
};

export type PlanDetailPayload = {
  id: string;
  category: string;
  title: string;
  date: string;
  locationLine: string;
  summary: string;
  liveState: {
    enabled: boolean;
    label: "LIVE" | "BEGIN" | "UPCOMING";
  };
  keyStats: {
    leaveBy?: string;
    weather?: string;
    parking?: string;
    nearbyPerson?: string;
  };
  sections: PlanDetailSection[];
  quoteCard?: {
    text: string;
    source?: string;
  };
};

export type PlanDetailSection = {
  id:
    | "before_you_go"
    | "the_move"
    | "atmosphere"
    | "details"
    | "optional_detours"
    | "after";
  title: string;
  subtitle: string;
  icon: string;
  content: unknown;
};

export type DecisionMode = "instant" | "standard" | "deep" | "director_cut";

export type ModelRole =
  | "fast_structured"
  | "intent"
  | "taste"
  | "atmosphere"
  | "planner"
  | "narrative"
  | "critic"
  | "director";

export type SourceLane =
  | "memory"
  | "directory"
  | "calendar"
  | "contacts"
  | "places"
  | "events"
  | "maps"
  | "weather"
  | "news"
  | "music"
  | "manual"
  | "none";

export type IntelligenceSurface =
  | "today"
  | "radar"
  | "circle"
  | "north"
  | "plan_detail";

export type IntelligenceInput = {
  userMessage?: string;
  surface?: IntelligenceSurface;
  currentPayload?: unknown;
  candidates?: NormalizedCandidate[];
  memory?: MemoryItem[];
  directoryContext?: unknown;
  decisionMode?: DecisionMode;
};

export type IntelligenceResult = {
  routed: RoutedIntelligence[];
  memoryProposals: MemoryUpdateProposal[];
  explanation: string;
};

export type RoutedPayloads = {
  today?: TodayPayload;
  radar?: RadarCard[];
  circle?: {
    people: CirclePerson[];
    updates: CircleUpdate[];
  };
  north?: NorthPayload;
  planDetails?: PlanDetailPayload[];
  memoryProposals: MemoryUpdateProposal[];
};
