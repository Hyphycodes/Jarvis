import type { CreateIndexedItemInput } from "@/lib/index/types";

/**
 * Clean seam for the next sprint's external API integrations
 * (Google Places, Mapbox, Open-Meteo, Ticketmaster, Tavily, Brave, SerpAPI).
 * No implementations live in this sprint — only the contract.
 */
export type SourceAdapterContext = {
  userId: string;
  homeCity?: string;
  lat?: number;
  lng?: number;
  now: Date;
};

export type SourceAdapter = {
  id: string;
  /** Lanes match the IntelligenceSource union in lib/ai/types.ts. */
  lane: "places" | "events" | "calendar" | "contacts" | "research" | "directory";
  fetch(context: SourceAdapterContext): Promise<CreateIndexedItemInput[]>;
};
