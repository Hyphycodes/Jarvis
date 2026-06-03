export type SourceStatus = "testing" | "watching" | "cooldown" | "muted" | "retired";
export type SourceType =
  | "publication"
  | "domain"
  | "venue"
  | "calendar"
  | "newsletter"
  | "tastemaker"
  | "organizer"
  | "search_pattern"
  | "author"
  | "restaurant_group"
  | "cultural_institution"
  | "community_group"
  | "other";

export type SourceGraphRow = {
  id: string;
  user_id: string;
  source_key: string;
  source_type: SourceType;
  url: string | null;
  domain: string | null;
  name: string | null;
  city: string | null;
  topics: string[];
  trust_score: number;
  taste_fit_score: number;
  novelty_score: number;
  freshness_score: number;
  save_rate: number;
  pass_rate: number;
  plan_rate: number;
  duplicate_rate: number;
  total_candidates: number;
  total_library_items: number;
  total_promoted: number;
  total_saved: number;
  total_passed: number;
  total_planned: number;
  last_checked_at: string | null;
  next_check_at: string | null;
  cadence_hours: number;
  status: SourceStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
