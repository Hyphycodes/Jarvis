export type ScoreBreakdown = {
  total: number;
  tasteFit: number;
  timing: number;
  logistics: number;
  atmosphere: number;
  originality: number;
  relationshipValue: number;
  northAlignment: number;
  confidence: number;
};

export type ScoringContext = {
  preferredTags?: string[];
  avoidTags?: string[];
  now?: string;
};
