import type { RadarCategory } from "@/lib/radar/category";

/**
 * Per-filter copy for the Radar category pages. Client-safe — no server
 * imports. Every word of category voice (ethos, accent line, tile labels,
 * empty states) lives here so the section components stay copy-free.
 * Source of truth: JARVIS_RADAR_PAGES spec.
 */

export type RadarFilterKey = "all" | RadarCategory;

export const RADAR_FILTER_KEYS: RadarFilterKey[] = [
  "all",
  "moves",
  "events",
  "dining",
  "culture",
  "places",
  "finds",
];

export type RadarIconKey =
  | "radar"
  | "arrow"
  | "calendar"
  | "fork"
  | "gallery"
  | "pin"
  | "sliders";

export type GlanceTileKey =
  // shared
  | "saved"
  | "thisWeek"
  | "new"
  | "nearby"
  | "favorites"
  // all
  | "held"
  | "newToday"
  // moves
  | "available"
  // events
  | "upcoming"
  | "confirmed"
  // dining
  | "reservations"
  | "toTry"
  // culture
  | "thisMonth"
  // finds
  | "attainable"
  | "aspirational"
  | "buyNow";

export type TileIconKey =
  | "calendar"
  | "bookmark"
  | "star"
  | "bell"
  | "pin"
  | "sparkle"
  | "zap"
  | "search"
  | "clock"
  | "arrow"
  | "ticket";

type CategoryCopy = {
  /** Serif italic page title. */
  title: string;
  /** White ethos line under the title. */
  ethos: string;
  /** Gold accent line under the ethos. */
  accent: string;
  /** Header icon (gold circle, top right). */
  icon: RadarIconKey;
  /** Section label for the featured hero. */
  heroLabel: string;
  /** Section label for the confirmed section (if the category has one). */
  confirmedLabel?: string;
  /** Section label for the saved row. */
  savedLabel: string;
  /** Empty state — rendered only when the entire page has nothing. */
  empty: string;
  /** The four at-a-glance tiles, in display order. */
  tiles: Array<{ key: GlanceTileKey; label: string; icon: TileIconKey }>;
};

export const RADAR_CATEGORY_COPY: Record<RadarFilterKey, CategoryCopy> = {
  all: {
    title: "Radar",
    ethos: "Curated signal for your taste and trajectory.",
    accent: "NOT EVERYTHING. JUST WHAT'S WORTH YOUR TIME.",
    icon: "radar",
    heroLabel: "STRONGEST SIGNAL",
    confirmedLabel: "CONFIRMED",
    savedLabel: "SAVED",
    empty: "Nothing strong enough to show yet. Jarvis is holding the line.",
    tiles: [
      { key: "held", label: "HELD", icon: "clock" },
      { key: "saved", label: "SAVED", icon: "bookmark" },
      { key: "thisWeek", label: "THIS WEEK", icon: "calendar" },
      { key: "newToday", label: "NEW TODAY", icon: "sparkle" },
    ],
  },
  moves: {
    title: "Moves",
    ethos: "Actions worth taking. Tonight or this week.",
    accent: "NOT EVERY OPTION. JUST THE RIGHT ONE.",
    icon: "arrow",
    heroLabel: "THE MOVE",
    savedLabel: "SAVED MOVES",
    empty: "No moves with enough signal right now.",
    tiles: [
      { key: "available", label: "AVAILABLE", icon: "arrow" },
      { key: "saved", label: "SAVED", icon: "bookmark" },
      { key: "thisWeek", label: "THIS WEEK", icon: "calendar" },
      { key: "nearby", label: "NEARBY", icon: "pin" },
    ],
  },
  events: {
    title: "Events",
    ethos: "What's happening that's actually worth your time.",
    accent: "NOT EVERY EVENT. JUST THE ONES THAT FIT.",
    icon: "calendar",
    heroLabel: "WORTH SHOWING UP FOR",
    confirmedLabel: "CONFIRMED EVENTS",
    savedLabel: "SAVED EVENTS",
    empty: "Nothing on the calendar worth showing right now.",
    tiles: [
      { key: "thisWeek", label: "THIS WEEK", icon: "calendar" },
      { key: "saved", label: "SAVED", icon: "bookmark" },
      { key: "upcoming", label: "UPCOMING", icon: "clock" },
      { key: "confirmed", label: "CONFIRMED", icon: "ticket" },
    ],
  },
  dining: {
    title: "Dining",
    ethos: "Places, meals, and moments worth remembering.",
    accent: "NOT EVERY MEAL. JUST THE RIGHT ONES.",
    icon: "fork",
    heroLabel: "WORTH THE TABLE",
    confirmedLabel: "UPCOMING RESERVATIONS",
    savedLabel: "SAVED PLACES",
    empty: "No dining matches worth showing right now. Jarvis is holding the line.",
    tiles: [
      { key: "reservations", label: "RESERVATIONS", icon: "calendar" },
      { key: "saved", label: "SAVED", icon: "bookmark" },
      { key: "favorites", label: "FAVORITES", icon: "star" },
      { key: "toTry", label: "TO TRY", icon: "bell" },
    ],
  },
  culture: {
    title: "Culture",
    ethos: "Art, music, food history, and ideas worth knowing.",
    accent: "NOT TRIVIA. REAL CULTURAL RANGE.",
    icon: "gallery",
    heroLabel: "WORTH KNOWING",
    savedLabel: "SAVED CULTURE",
    empty: "Nothing with enough cultural signal right now.",
    tiles: [
      { key: "saved", label: "SAVED", icon: "bookmark" },
      { key: "thisMonth", label: "THIS MONTH", icon: "calendar" },
      { key: "new", label: "NEW", icon: "sparkle" },
      { key: "nearby", label: "NEARBY", icon: "pin" },
    ],
  },
  places: {
    title: "Places",
    ethos: "Physical spots worth knowing. Worth going back to.",
    accent: "NOT EVERY SPOT. JUST THE ONES THAT HOLD UP.",
    icon: "pin",
    heroLabel: "WORTH THE TRIP",
    savedLabel: "SAVED SPOTS",
    empty: "No places worth surfacing right now.",
    tiles: [
      { key: "saved", label: "SAVED", icon: "bookmark" },
      { key: "nearby", label: "NEARBY", icon: "pin" },
      { key: "favorites", label: "FAVORITES", icon: "star" },
      { key: "new", label: "NEW", icon: "sparkle" },
    ],
  },
  finds: {
    title: "Finds",
    ethos: "Objects, tools, and pieces worth owning.",
    accent: "NOT MORE STUFF. JUST THE RIGHT THINGS.",
    icon: "sliders",
    heroLabel: "WORTH BUYING NOW",
    savedLabel: "SAVED FINDS",
    empty: "No finds worth buying yet.",
    tiles: [
      { key: "saved", label: "SAVED", icon: "bookmark" },
      { key: "attainable", label: "ATTAINABLE", icon: "search" },
      { key: "aspirational", label: "ASPIRATIONAL", icon: "star" },
      { key: "buyNow", label: "BUY NOW", icon: "zap" },
    ],
  },
};
