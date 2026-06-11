import type { RadarCard as RadarPayloadCard } from "@/lib/ai/types";
import type { RadarFilterKey } from "@/lib/radar/categoryCopy";

/** The visible Radar filter tabs, in display order. */
export const FILTERS = [
  "All",
  "Moves",
  "Events",
  "Dining",
  "Culture",
  "Places",
  "Finds",
] as const;

export type Filter = (typeof FILTERS)[number];

export const FILTER_TO_KEY: Record<Filter, RadarFilterKey> = {
  All: "all",
  Moves: "moves",
  Events: "events",
  Dining: "dining",
  Culture: "culture",
  Places: "places",
  Finds: "finds",
};

/** The adapted card shape the Radar feed renders. */
export type Card = {
  id: string;
  category: string;
  title: string;
  body: string;
  whoLine?: string;
  meta: string[];
  footerLine: string;
  imageUrl?: string;
  placeholderKind?: RadarPayloadCard["placeholderKind"];
  planSlug?: string;
  canGeneratePlan: boolean;
  filter: Filter;
  sourceLabel?: string;
  sourceBrain?: string;
  budgetTier?: RadarPayloadCard["budgetTier"];
  score: number;
};
