"use client";

import {
  RADAR_CATEGORY_COPY,
  type GlanceTileKey,
  type RadarFilterKey,
} from "@/lib/radar/categoryCopy";
import type { CategoryPageData } from "@/lib/radar/categoryPagesTypes";
import { AtAGlanceRow } from "./AtAGlanceRow";
import { CategoryEmptyState } from "./CategoryEmptyState";
import { ConfirmedSection } from "./ConfirmedSection";
import { FeaturedHero } from "./FeaturedHero";
import { SavedRow } from "./SavedRow";
import type { Card } from "./types";

const EMPTY_DATA: CategoryPageData = {
  heldCount: 0,
  glance: [],
  confirmed: [],
  saved: [],
  savedTotal: 0,
};

/**
 * The content of one Radar category page — everything BELOW the fixed header
 * and tab row (the header/tabs live in RadarSigned and stay pinned). Composed
 * to fit one screen, no scrolling feed: at-a-glance tiles, a confirmed section
 * (reservations/events) OR a featured hero card, then saved rows.
 *
 * The featured hero and confirmed cards are real clickable cards that route
 * into the full plan/detail.
 */
export function CategoryPage({
  filter,
  data,
  cards,
  favoriteIds,
  onTileTap,
  onToggleFavorite,
  onViewAllSaved,
}: {
  filter: RadarFilterKey;
  data: CategoryPageData | undefined;
  cards: Card[];
  favoriteIds: Set<string>;
  onTileTap: (tile: { key: GlanceTileKey; label: string }) => void;
  onToggleFavorite: (id: string, next: boolean) => void;
  onViewAllSaved: () => void;
}) {
  const copy = RADAR_CATEGORY_COPY[filter];
  const page = data ?? EMPTY_DATA;

  const hasConfirmed = Boolean(copy.confirmedLabel) && page.confirmed.length > 0;

  // Featured hero: the strongest surfaced recommendation (restaurant, event,
  // find, …). It's a real clickable card that routes into the full plan — or,
  // for Finds, into the finds template. Shown whenever a surfaced card exists;
  // the fuller list of surfaced items lives behind the at-a-glance tiles.
  const ranked = [...cards].sort((a, b) => b.score - a.score);
  const hero =
    ranked.find((card) => card.planSlug) ??
    ranked.find((card) => card.imageUrl) ??
    ranked[0];
  const heroHref = hero
    ? hero.filter === "Finds"
      ? `/find/${hero.id}`
      : hero.planSlug
        ? `/plan/${hero.planSlug}`
        : `/item/${hero.id}`
    : undefined;
  const showHero = Boolean(hero && heroHref);

  const hasBody = hasConfirmed || showHero || page.saved.length > 0;

  return (
    <div className="pb-[calc(var(--nav-total-h)+24px)] pt-6">
      <AtAGlanceRow filter={filter} tiles={page.glance} onTileTap={onTileTap} />
      {hasConfirmed && copy.confirmedLabel ? (
        <ConfirmedSection
          label={copy.confirmedLabel}
          entries={page.confirmed.slice(0, 2)}
        />
      ) : null}
      {showHero && hero && heroHref ? (
        <FeaturedHero label={copy.heroLabel} card={hero} href={heroHref} />
      ) : null}
      {page.saved.length > 0 ? (
        <SavedRow
          label={copy.savedLabel}
          entries={page.saved.slice(0, 3)}
          total={page.savedTotal}
          favoriteIds={favoriteIds}
          onToggleFavorite={onToggleFavorite}
          onViewAll={onViewAllSaved}
        />
      ) : null}
      {!hasBody ? <CategoryEmptyState filter={filter} /> : null}
    </div>
  );
}
