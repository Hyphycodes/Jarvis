"use client";

import type { ReactNode } from "react";
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
import { RadarCategoryHeader } from "./RadarCategoryHeader";
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
 * Assembles one composed Radar category page from real data, per the spec:
 * header → tab row → at-a-glance → confirmed → featured hero → feed → saved.
 * Every section collapses when it has nothing real to show; the empty state
 * renders only when the whole page is empty.
 */
export function CategoryPage({
  filter,
  data,
  date,
  cards,
  favoriteIds,
  tabRow,
  renderCard,
  onHeldTap,
  onTileTap,
  onToggleFavorite,
  onViewAllSaved,
}: {
  filter: RadarFilterKey;
  data: CategoryPageData | undefined;
  date: string;
  cards: Card[];
  favoriteIds: Set<string>;
  tabRow: ReactNode;
  renderCard: (card: Card) => ReactNode;
  onHeldTap: () => void;
  onTileTap: (tile: { key: GlanceTileKey; label: string }) => void;
  onToggleFavorite: (id: string, next: boolean) => void;
  onViewAllSaved: () => void;
}) {
  const copy = RADAR_CATEGORY_COPY[filter];
  const page = data ?? EMPTY_DATA;

  // Featured hero: strongest card with a ready plan; else strongest with an
  // image. Derived from live items only — no data, no hero.
  const ranked = [...cards].sort((a, b) => b.score - a.score);
  const hero = ranked.find((card) => card.planSlug) ?? ranked.find((card) => card.imageUrl);
  const feed = cards.filter((card) => card.id !== hero?.id);
  const heroHref = hero
    ? hero.filter === "Finds"
      ? `/find/${hero.id}`
      : hero.planSlug
        ? `/plan/${hero.planSlug}`
        : `/item/${hero.id}`
    : undefined;

  const isEmpty =
    page.glance.length === 0 &&
    page.confirmed.length === 0 &&
    !hero &&
    feed.length === 0 &&
    page.saved.length === 0;

  return (
    <>
      <RadarCategoryHeader
        filter={filter}
        date={date}
        heldCount={page.heldCount}
        onHeldTap={onHeldTap}
      />
      {tabRow}
      {isEmpty ? (
        <CategoryEmptyState filter={filter} />
      ) : (
        <>
          <AtAGlanceRow filter={filter} tiles={page.glance} onTileTap={onTileTap} />
          {copy.confirmedLabel ? (
            <ConfirmedSection label={copy.confirmedLabel} entries={page.confirmed} />
          ) : null}
          {hero && heroHref ? (
            <FeaturedHero label={copy.heroLabel} card={hero} href={heroHref} />
          ) : null}
          {feed.length > 0 ? (
            <section className="mt-9">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">
                On the radar
              </h2>
              <div className="mt-3 flex flex-col gap-5">
                {feed.map((card) => renderCard(card))}
              </div>
            </section>
          ) : null}
          <SavedRow
            label={copy.savedLabel}
            entries={page.saved}
            total={page.savedTotal}
            favoriteIds={favoriteIds}
            onToggleFavorite={onToggleFavorite}
            onViewAll={onViewAllSaved}
          />
        </>
      )}
    </>
  );
}
