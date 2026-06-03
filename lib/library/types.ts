import type { Json } from "@/lib/types/database";
import type { LibraryQualityTier } from "@/lib/library/quality";

export type LibraryEntityType =
  | "place"
  | "event"
  | "source"
  | "person"
  | "organization"
  | "neighborhood"
  | "recurring_signal"
  | "opportunity";

export type LibraryEntity = {
  id: string;
  type: LibraryEntityType;
  title: string;
  summary?: string;
  city?: string;
  tags: string[];
  status: "candidate" | "active" | "watching" | "stale" | "muted" | "rejected" | "archived";
  qualityTier?: LibraryQualityTier;
  qualityScore?: number;
  lastSeenAt?: string;
  lastResearchedAt?: string;
  nextRefreshAt?: string;
  sourceId?: string;
  metadata?: Json;
};

export type LibraryHealth = {
  places: number;
  events: number;
  sources: number;
  organizations: number;
  people: number;
  recurringSignals: number;
  pendingCandidates: number;
  rejectedMuted: number;
  needsRefresh: number;
  tierA: number;
  tierB: number;
  tierC: number;
  depthScore: number;
};
