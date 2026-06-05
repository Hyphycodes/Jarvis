/**
 * PlanBrief — the editorial view model that powers every plan page.
 *
 * Built by `lib/plans/buildPlanBrief.ts` from a LoadedPlan (preferred) or
 * an IndexedItem (item-only fallback). Never invents facts; uses honest,
 * directional fallback copy from `lib/plans/planCopyBanks.ts` when data
 * is missing. The `truth.missing[]` field tracks which slots fell back
 * so the InfoStrip can render honest "Weather not connected" / "Confirm
 * parking" copy without a separate debug block.
 *
 * Three plan pages consume the brief:
 *   /plan/[slug]            — hero + infoStrip + chapters + quote card
 *   /plan/[slug]/before     — wear / bring / know blocks
 *   /plan/[slug]/move       — timeline
 *
 * Four refined-light pages also consume one slice each:
 *   /plan/[slug]/atmosphere /details /detours /after
 */

export type PlanCategory =
  | "dining"
  | "social"
  | "family"
  | "errand"
  | "creative"
  | "work"
  | "wellness"
  | "travel"
  | "purchase"
  | "unknown";

export type PlanState = "holding" | "ready" | "live" | "after";

export type PlanChapterKey =
  | "before"
  | "move"
  | "atmosphere"
  | "details"
  | "detours"
  | "after"
  | "around-it"; // merges detours + after for the Experience shape

export type PlanInfoBlock = {
  /** Small-caps label, e.g. "LEAVE BY". */
  label: string;
  /** Primary value, e.g. "7:42 PM" or "Weather not connected". */
  value: string;
  /** Optional second line under the value, e.g. "Clearing". */
  sub?: string;
  /** Icon key resolved by components/plan/icons.tsx. */
  icon?: "clock" | "weather" | "parking" | "person";
  /** Optional action URL; external links are opened in a new tab. */
  href?: string;
  external?: boolean;
  /** Set when this block fell back from missing data — used for muted styling. */
  missing?: boolean;
};

export type PlanChapter = {
  key: PlanChapterKey;
  title: string;        // "BEFORE YOU GO"
  description: string;  // "What to wear, bring, and know before you leave."
  href: string;         // "/plan/[slug]/before"
  icon: "jacket" | "wine" | "record" | "map-pin" | "signpost" | "moon";
  /** One short line under the description summarizing what the chapter knows. */
  confirmation?: string;
  /** True when this chapter has real section content. Used to hide empty optional chapters. */
  hasContent: boolean;
};

export type PlanBeforeSection = {
  wear: string[];
  bring: string[];
  know: string[];
  closing?: string;
};

export type PlanMoveItem = {
  time?: string;       // "7:42 PM"
  title: string;       // "Leave home."
  body: string;        // italic body
  note?: string;       // uppercase note shown under body
};

export type PlanMoveSection = {
  title?: string;
  subtitle?: string;
  items: PlanMoveItem[];
  closing?: string;
};

export type PlanLightSection = {
  /** Body paragraph (already shaped — never a raw DB string). */
  body: string;
  /** Optional bullet list under the body. */
  bullets?: string[];
  /** One-line confirmation rendered under a divider. */
  confirmation: string;
  /** Closing line at the bottom of the page. */
  closing: string;
  /** True when the body fell back because no real section data existed. */
  fallback?: boolean;
};

export type PlanTruth = {
  /** Slot keys that fell back to honest copy. Internal use only. */
  missing: string[];
  /** Notes about derivations the builder made (e.g. "timing from starts_at"). */
  assumed: string[];
};

export type PlanBrief = {
  slug: string;
  /** Plan-row id when one exists (used for activate / complete / cancel calls). */
  planId?: string;
  sourceId?: string;
  sourceType?: "today" | "radar" | "event" | "sample";
  title: string;
  category: PlanCategory;
  /** Plan shape (PRE-G3) — drives which chapters render. */
  shape: "experience" | "occasion" | "acquisition" | "touchpoint";
  /** When true, The Move (step-by-step flow) renders for Experience plans. */
  isSequential: boolean;
  dateLabel?: string;
  timeLabel?: string;
  areaLabel?: string;
  locationLabel?: string;
  /** Scheduled date in YYYY-MM-DD (from the date picker), when set. */
  scheduledDate?: string;
  /** Scheduled time in HH:MM 24h, when set. */
  scheduledTime?: string;
  /** "building" while the background generator is still filling sections. */
  buildStatus?: string;
  heroImage?: string;
  /** Short editorial summary — never a raw DB description. */
  summary: string;
  state: PlanState;
  /** Plan-generator confidence in 0..1 when known. */
  confidence?: number;
  /** "fallback" stamp when the generator used its deterministic fallback. */
  fallbackUsed: boolean;
  infoStrip: PlanInfoBlock[];
  chapters: PlanChapter[];
  before: PlanBeforeSection;
  move: PlanMoveSection;
  atmosphere: PlanLightSection;
  details: PlanLightSection;
  detours: PlanLightSection;
  after: PlanLightSection;
  /** Single italic quote shown in the quote card on the main plan page. */
  quote: {
    body: string;
    attribution?: string;
  };
  truth: PlanTruth;
};
