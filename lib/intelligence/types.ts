import type { RadarDecision } from "@/lib/brain/decisionCouncilTypes";
import type { BrainContextPacket } from "@/lib/brain/types";
import type { NorthAlignment } from "@/lib/context/types";
import type { IndexedItem } from "@/lib/index/types";

export type RadarVibe =
  | "quiet_luxury"
  | "cinematic_night"
  | "social_controlled"
  | "creative_spark"
  | "body_reset"
  | "money_move"
  | "tactical_errand"
  | "family_social_respect"
  | "solo_recharge"
  | "culture_with_taste"
  | "land_escape"
  | "relationship_maintenance"
  | "stylish_purchase"
  | "local_discovery"
  | "work_leverage"
  | "content_opportunity"
  | "useful_move";

export type JarvisContext = BrainContextPacket & {
  activeRadarCount?: number;
  currentRadarItems?: IndexedItem[];
  /** Time-of-day context string forwarded from the velocity profile so
   *  occasion-aware confidence floors in the Decision Council receive the
   *  same timeContext that pre-biased the shortlist. */
  velocityTimeContext?: string;
};

export type SignalProfile = {
  category: string;
  type: string;
  vibe: RadarVibe;
  diversityGroup: string;
  urgency: number;
  effort: "low" | "medium" | "high" | "unknown";
  spend: "free" | "low" | "paid" | "high" | "unknown";
  timingWindow?: string;
  socialWeight: number;
  tasteFit: number;
  novelty: number;
  practicalFriction: number;
  confidence: number;
  evidenceQuality: number;
  sourceDomain?: string;
  sourceTrust: number;
  purposeLabel: string;
  moveTitle: string;
  reasonSurfaced: string;
  strongestAngle: string;
  suggestedAction: string;
  negativeFlags: string[];
  positiveSignals: string[];
};

export type TasteRead = {
  score: number;
  positiveSignals: string[];
  negativeFlags: string[];
  laneMatches: string[];
  belongs: boolean;
};

export type RhythmRead = {
  score: number;
  label: string;
  phase: "morning" | "work" | "commute" | "evening" | "weekend" | "unknown";
  notes: string[];
};

export type TruthRead = {
  evidenceQuality: number;
  knownDetails: string[];
  missingDetails: string[];
  flags: string[];
};

export type JarvisJudgment = {
  admission: RadarDecision["admission"];
  confidence: number;
  reason: string;
  decision: RadarDecision;
};

export type JarvisCopy = {
  title: string;
  oneLine: string;
  reasonSurfaced: string;
  strongestAngle: string;
  nextMove: string;
};

export type RadarScore = {
  total: number;
  tasteFit: number;
  timingFit: number;
  novelty: number;
  usefulness: number;
  vibeStrength: number;
  planPotential: number;
  evidenceQuality: number;
  socialUpside: number;
  creativeUpside: number;
  longTermValue: number;
  energyCost: number;
  moneyCost: number;
  redundancyPenalty: number;
  northAlignment: NorthAlignment;
};

export type PlanReadiness = {
  shouldPreparePlan: boolean;
  confidence: number;
  knownDetails: string[];
  missingDetails: string[];
  planSeed?: {
    title: string;
    category: string;
    location?: string;
    timeWindow?: string;
    summary: string;
    reason: string;
    likelyChapters: string[];
    firstMove: string;
  };
};

export type RadarItem = {
  item: IndexedItem;
  title: string;
  category: string;
  vibe: RadarVibe;
  reasonSurfaced: string;
  strongestAngle: string;
  confidence: number;
  score: number;
  scoreBreakdown: RadarScore;
  planReadiness: PlanReadiness;
  source: {
    source?: string;
    domain?: string;
  };
  evidence: {
    quality: number;
    summary?: string;
  };
  missingInfo: string[];
  suggestedAction: string;
  radarDisposition: "active" | "holding" | "archive";
  todayDisposition: "today" | "not_today";
  planDisposition: "ready" | "seed" | "not_ready";
  planSlug?: string;
  canGeneratePlan: boolean;
  diversityGroup: string;
  decision: RadarDecision;
  northAlignment: NorthAlignment;
};

export type RadarDiversityReport = {
  groups: Record<string, number>;
  repeatedGroups: string[];
  selectedGroups: string[];
};

export type RadarBoard = {
  items: RadarItem[];
  minimumTarget: number;
  maximumCap: number;
  qualityFloor: number;
  diversity: RadarDiversityReport;
  researchRuns: number;
  rejectedCount: number;
  missingContext: string[];
};

export type SurfaceDecision = {
  item: IndexedItem;
  signal: SignalProfile;
  judgment: JarvisJudgment;
  truth: TruthRead;
  copy: JarvisCopy;
  score: RadarScore;
  planReadiness: PlanReadiness;
};

export type PlanDecision = {
  shouldPrepare: boolean;
  readiness: PlanReadiness;
};

export type MemoryWritebackSuggestion = {
  shouldWrite: boolean;
  kind: "taste" | "avoidance" | "pattern" | "context";
  content: string;
  confidence: number;
  reason: string;
};
