import type { RadarCategory } from "@/lib/radar/category";
import type { GlanceTileKey, RadarFilterKey } from "@/lib/radar/categoryCopy";

/**
 * Shapes shared between the server loader (lib/radar/categoryPages.ts), the
 * tile-items API route, and the client Radar pages. Client-safe — types only.
 */

export type GlanceTile = {
  key: GlanceTileKey;
  count: number;
};

export type ConfirmedEntry = {
  id: string;
  title: string;
  /** Venue/neighborhood · price-style support line. */
  detailLine?: string;
  /**
   * Committed start time (row.starts_at, else the linked plan's starts_at).
   * Undefined for planned-but-undated commitments — rendered as PLANNED.
   */
  whenIso?: string;
  imageUrl?: string;
  href: string;
  category?: RadarCategory;
  favorited: boolean;
};

export type ListEntry = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  href: string;
  category?: RadarCategory;
  favorited: boolean;
};

export type CategoryPageData = {
  /** Active/surfaced items in this category — the gold-dot "N HELD" count. */
  heldCount: number;
  /** Non-zero stat tiles, in copy-map order. Empty array → row hidden. */
  glance: GlanceTile[];
  /** Future-dated planned items (reservations / confirmed), ascending. */
  confirmed: ConfirmedEntry[];
  /** Latest saved items for the preview row. */
  saved: ListEntry[];
  savedTotal: number;
};

export type RadarCategoryPagesPayload = {
  pages: Record<RadarFilterKey, CategoryPageData>;
  /** ids of items the user has favorited — seeds the card bookmark state. */
  favoriteIds: string[];
};
