import type { Json, IndexItemStatus } from "@/lib/types/database";
import type { ItemBriefing } from "@/lib/brain/briefingTypes";

export type { IndexItemStatus } from "@/lib/types/database";

export type IndexItemType =
  | "restaurant"
  | "event"
  | "culture"
  | "place"
  | "person"
  | "product"
  | "travel"
  | "real_estate"
  | "health"
  | "style"
  | "creative"
  | "faith"
  | "task"
  | "plan"
  | "recommendation"
  | "north_step"
  | "pillar_signal"
  | "relationship_update";

export type IndexDestination =
  | "today"
  | "radar"
  | "north"
  | "circle"
  | "plan"
  | "holding"
  | "upcoming";

export type IndexItemSource =
  | "system"
  | "manual"
  | "ai"
  | "memory"
  | "directory"
  | "research"
  | "places"
  | "events"
  | "calendar"
  | "contacts";

export type IndexedItem = {
  id: string;
  source: IndexItemSource;
  sourceId?: string;
  type: IndexItemType;
  category?: string;
  title: string;
  subtitle?: string;
  description?: string;
  locationName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  startsAt?: string;
  endsAt?: string;
  expiresAt?: string;
  url?: string;
  imageUrl?: string;
  rawPayload: Json;
  briefing?: ItemBriefing;
  status: IndexItemStatus;
  destination: IndexDestination;
  score?: number;
  reasons: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateIndexedItemInput = {
  type: IndexItemType;
  destination: IndexDestination;
  title: string;
  source?: IndexItemSource;
  sourceId?: string;
  category?: string;
  subtitle?: string;
  description?: string;
  locationName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  startsAt?: string;
  endsAt?: string;
  expiresAt?: string;
  url?: string;
  imageUrl?: string;
  rawPayload?: Json;
  status?: IndexItemStatus;
  score?: number;
  reasons?: string[];
  tags?: string[];
};

export type ListIndexItemsFilter = {
  destination?: IndexDestination | IndexDestination[];
  type?: IndexItemType | IndexItemType[];
  status?: IndexItemStatus | IndexItemStatus[];
  limit?: number;
  includeExpired?: boolean;
};
