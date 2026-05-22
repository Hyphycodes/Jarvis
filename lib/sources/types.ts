import type { CreateIndexedItemInput } from "@/lib/index/types";

export type SourceLane =
  | "places"
  | "events"
  | "weather"
  | "maps"
  | "research"
  | "shopping"
  | "sports"
  | "calendar"
  | "contacts"
  | "directory";

export type SourceAdapterContext = {
  userId: string;
  homeCity?: string;
  lat?: number;
  lng?: number;
  now: Date;
};

export type SourceAdapter = {
  id: string;
  lane: SourceLane;
  /** Returns `null` candidates when the adapter is not configured. */
  fetch(
    context: SourceAdapterContext,
  ): Promise<CreateIndexedItemInput[]>;
};

export type SourceHealthStatus =
  | "available"
  | "not_configured"
  | "error";

export type SourceHealth = Record<string, SourceHealthStatus>;
