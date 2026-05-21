import type { NormalizedCandidate, SourceLane } from "@/lib/ai/types";

export type ResearchSource =
  | "google_places"
  | "routes"
  | "open_meteo"
  | "ticketmaster"
  | "mlb_stats"
  | "spotify"
  | "newsdata"
  | "calendar"
  | "contacts"
  | "manual";

export type ResearchRequest = {
  lanes: SourceLane[];
  query?: string;
  location?: string;
  datetime?: string;
};

export type ResearchResult = {
  candidates: NormalizedCandidate[];
  sourceHealth: Record<string, "available" | "not_configured" | "error">;
  missingData: string[];
};

export type ResearchCacheEntry<TPayload = unknown> = {
  id: string;
  key: string;
  source: ResearchSource;
  payload: TPayload;
  expiresAt: string;
  createdAt: string;
};
