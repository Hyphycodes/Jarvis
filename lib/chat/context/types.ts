export type TodayContext = {
  isoDate: string;
  localDateLabel: string;
  timezone: string;
  homeCity: string | null;
  weather: {
    temperatureF: number;
    windMph: number;
    weatherCode: number;
  } | null;
};

export type UserProfileContext = {
  displayName: string | null;
  homeCity: string | null;
  lifeDirection: string | null;
  currentFocus: string | null;
  vibeKeywords: string[];
  avoidKeywords: string[];
  dealbreakers: string[];
  pinnedPrinciples: string[];
};

export type PlanContext = {
  id: string;
  title: string;
  status: string;
  buildStatus: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  summary: string | null;
};

export type RadarItemContext = {
  id: string;
  title: string;
  category: string | null;
  status: string;
  planningState: string | null;
  tasteFitSummary: string | null;
  reasons: string[];
};

export type CirclePersonContext = {
  id: string;
  name: string;
  category: string;
  role: string | null;
  closenessScore: number;
  lastInteraction: string | null;
  notes: string[];
};

export type PreferenceContext = {
  content: string;
  kind: string;
  confidence: number;
  category?: string | null;
  direction?: "positive" | "negative" | null;
};

export type BehaviorSignalContext = {
  signalType: string;
  subjectId: string | null;
  objectType: string | null;
  objectId: string | null;
  createdAt: string;
};

export type ConstraintContext = {
  type: "diet" | "schedule" | "location" | "taste" | "commitment" | "avoidance";
  summary: string;
  source: string;
};

export type ChatContextPacket = {
  today: TodayContext;
  user: UserProfileContext;
  activePlans: PlanContext[];
  radar: RadarItemContext[];
  circle: CirclePersonContext[];
  preferences: PreferenceContext[];
  recentSignals: BehaviorSignalContext[];
  constraints: ConstraintContext[];
};
