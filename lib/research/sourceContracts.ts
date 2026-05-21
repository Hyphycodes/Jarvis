import type { ResearchRequest, ResearchResult, ResearchSource } from "@/lib/research/types";

export type ResearchAdapter = {
  source: ResearchSource;
  search(request: ResearchRequest): Promise<ResearchResult>;
};

export const FUTURE_RESEARCH_SOURCES: ResearchSource[] = [
  "google_places",
  "routes",
  "open_meteo",
  "ticketmaster",
  "mlb_stats",
  "spotify",
  "newsdata",
  "calendar",
  "contacts",
];

export async function runResearch(
  _request: ResearchRequest,
): Promise<ResearchResult> {
  return {
    candidates: [],
    sourceHealth: Object.fromEntries(
      FUTURE_RESEARCH_SOURCES.map((source) => [source, "not_configured"]),
    ),
    missingData: ["External research adapters are intentionally not connected in this sprint."],
  };
}
