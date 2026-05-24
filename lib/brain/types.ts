import type { IndexedItem, IndexItemStatus } from "@/lib/index/types";
import type { BriefingMeta, ItemBriefing } from "@/lib/brain/briefingTypes";
import type { RadarDecision } from "@/lib/brain/decisionCouncilTypes";
import type { RadarItem } from "@/lib/intelligence/types";

export type BrainSelection = {
  itemId: string;
  destination:
    | "today"
    | "radar"
    | "north"
    | "circle"
    | "plan"
    | "holding"
    | "upcoming";
  confidence: number;
  reason: string;
  displayAngle: string;
  tags: string[];
  briefing?: ItemBriefing;
  briefingMeta?: BriefingMeta;
  radarDecision?: RadarDecision;
  radarIntelligence?: RadarItem;
};

export type BrainRejection = {
  itemId: string;
  reason: string;
  suggestedStatus: IndexItemStatus;
};

export type BrainDecision = {
  selected: BrainSelection[];
  rejected: BrainRejection[];
  notes: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
};

export type BrainContextPacket = {
  now: string;
  homeCity?: string;
  homeState?: string;
  homeLat?: number;
  homeLng?: number;
  founder: {
    displayName?: string | null;
    homeCity?: string | null;
    timezone?: string | null;
    lifeDirection?: string | null;
    currentFocus?: string | null;
    vibeKeywords: string[];
    avoidKeywords: string[];
    dealbreakers: string[];
    pinnedPrinciples: string[];
  };
  memory: {
    content: string;
    kind: string;
    confidence: number;
  }[];
  recentSignals: {
    signal_type: string;
    subject_id: string | null;
    created_at: string;
  }[];
  recentActions: {
    title: string;
    status: IndexItemStatus;
    category?: string | null;
  }[];
  northTags: string[];
  weather?: {
    temperatureF: number;
    windMph: number;
    weatherCode: number;
  } | null;
  activePlan?: {
    id: string;
    title: string;
    summary: string | null;
    liveEnabled: boolean;
  } | null;
  weeklyRhythm?: {
    enabled: boolean;
    workdays: string[];
    leaveHome: string;
    workStart: string;
    leaveWork: string;
    arriveHome: string;
    workLocation: string;
    timezone: string;
  };
};

export type ScoredItem = {
  item: IndexedItem;
  score: number;
  reasons: string[];
};

export type CurationInput = {
  context: BrainContextPacket;
  shortlist: ScoredItem[];
  maxSelected?: number;
};
