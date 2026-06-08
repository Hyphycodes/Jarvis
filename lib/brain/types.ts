import type { IndexedItem, IndexItemStatus } from "@/lib/index/types";
import type { BriefingMeta, ItemBriefing } from "@/lib/brain/briefingTypes";
import type { RadarDecision } from "@/lib/brain/decisionCouncilTypes";
import type { RadarItem } from "@/lib/intelligence/types";
import type { PlacesLibraryRow } from "@/lib/types/database";
import type { NorthAlignment } from "@/lib/context/types";
import type { OperatingPreferences } from "@/lib/operating/operatingPreferences";

export type PersonContext = {
  name: string;
  relationship: string | null;
  category: string;
  last_interaction: string | null;
  notable_traits: string[];
  recent_update?: {
    title: string;
    summary: string;
    urgency: string;
  } | null;
};

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
  northPillars: Array<{
    id: string;
    title: string;
    progress: number | null;
  }>;
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
  /** Declared OPERATING controls (mode + spend + rhythm preferences). */
  operating: OperatingPreferences;
  people: PersonContext[];
  /** Life context — what the founder's actual week looks like, so curation
   *  reflects rhythm and gaps, not just taste. Optional so nothing breaks if
   *  it isn't populated. */
  lifeContext?: {
    radarComposition: Record<string, number>; // { dining: 2, music: 0, activity: 1 }
    categoryGaps: string[]; // categories with 0 items on Radar
    recentActivityByCategory: Record<string, number>; // outings in last 14 days by category
    upcomingOccasions: Array<{
      personName: string;
      occasionType: string;
      daysOut?: number;
      clusterNote?: string;
    }>;
    activePillarTitles: string[];
  };
};

export type ScoredItem = {
  item: IndexedItem;
  score: number;
  reasons: string[];
  northAlignment?: NorthAlignment;
  crossSourceCount?: number; // how many distinct sources named this place
};

export type CurationInput = {
  context: BrainContextPacket;
  shortlist: ScoredItem[];
  maxSelected?: number;
  libraryEntries?: PlacesLibraryRow[];
};
