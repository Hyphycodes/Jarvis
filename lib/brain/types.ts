import type { IndexedItem, IndexItemStatus } from "@/lib/index/types";

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
