"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useEmblaCarousel from "embla-carousel-react";
import type { UseEmblaCarouselType } from "embla-carousel-react";
import { CategoryPage } from "@/components/radar/sections/CategoryPage";
import { RadarCategoryHeader } from "@/components/radar/sections/RadarCategoryHeader";
import {
  TileListSheet,
  type TileSheetTarget,
} from "@/components/radar/sections/TileListSheet";
import {
  FILTERS,
  FILTER_TO_KEY,
  type Card,
  type Filter,
} from "@/components/radar/sections/types";
import type { RadarCard as RadarPayloadCard } from "@/lib/ai/types";
import type { GlanceTileKey } from "@/lib/radar/categoryCopy";
import type { RadarCategoryPagesPayload } from "@/lib/radar/categoryPagesTypes";

type EmblaApi = NonNullable<UseEmblaCarouselType[1]>;

type HoldingItem = {
  id: string;
  category: string;
  title: string;
  body: string;
  meta: string[];
  footerLine: string;
  imageUrl?: string;
  planSlug?: string;
};

function adaptRadarToCard(item: RadarPayloadCard): Card {
  const filter = mapCategoryToFilter(item.category);
  const title = item.title;
  const area = distinctFromTitle(item.neighborhood ?? item.locationLabel, title);
  const meta = [formatWhen(item.datetime, item.whenConfirmed)].filter(
    (value): value is string => Boolean(value),
  );
  const footerLine = uniqueParts([area, item.priceEstimate]).join(" · ");
  return {
    id: item.id,
    category: (item.displayCategory ?? mapCategoryToBadge(item.category)).toUpperCase(),
    title,
    body: item.oneLine || item.summary || item.whyItFits || "Worth a closer look.",
    whoLine: distinctFromTitle(item.whoItsFor, title),
    meta,
    footerLine,
    imageUrl: item.imageUrl,
    placeholderKind: item.placeholderKind,
    planSlug: item.planSlug,
    canGeneratePlan: Boolean(!item.planSlug && item.actions.openPlan),
    filter,
    sourceLabel: item.sourceLabel,
    sourceBrain: item.sourceBrain,
    budgetTier: item.budgetTier,
    score: item.score ?? 0,
  };
}

/** Drop a value that is just the title again (case/spacing-insensitive). */
function distinctFromTitle(
  value: string | undefined,
  title: string,
): string | undefined {
  if (!value) return undefined;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(value) === norm(title) ? undefined : value;
}

/** Join non-empty, de-duplicated parts (case-insensitive). */
function uniqueParts(parts: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    const key = part.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

function mapCategoryToFilter(category: string): Filter {
  switch (category.toLowerCase()) {
    case "dining":
      return "Dining";
    case "move":
    case "activity":
    case "outdoors":
    case "skill":
    case "health":
    case "creative":
    case "ownership":
      return "Moves";
    case "events":
    case "event":
      return "Events";
    case "culture":
      return "Culture";
    case "place":
    case "places":
      return "Places";
    case "style":
    case "product":
    case "finds":
      return "Finds";
    case "music":
      return "Events";
    default:
      return "All";
  }
}

function mapCategoryToBadge(category: string): Card["category"] {
  switch (category.toLowerCase()) {
    case "move":
      return "MOVE";
    case "dining":
      return "DINING";
    case "culture":
      return "CULTURE";
    case "events":
    case "event":
      return "EVENT";
    case "sports":
      return "SPORTS";
    case "music":
      return "CULTURE";
    case "style":
    case "product":
      return "FINDS";
    case "activity":
      return "ACTIVITY";
    case "outdoors":
      return "OUTDOORS";
    case "skill":
      return "SKILL";
    case "health":
      return "HEALTH";
    case "creative":
      return "CREATIVE";
    case "ownership":
      return "OWNERSHIP";
    case "travel":
      return "TRAVEL";
    case "idea":
      return "IDEA";
    case "watch":
      return "WATCH";
    case "source_lead":
      return "SOURCE LEAD";
    case "finds":
      return "FINDS";
    case "opportunity":
      return "OPPORTUNITY";
    default:
      return "ITEM";
  }
}

function formatWhen(iso?: string, confirmed?: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (confirmed) {
    const date = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return `${date} · ${time}`;
  }
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  return `Suggested · ${weekday} ${time}`;
}

function formatToday(): string {
  return new Date()
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

export function RadarSigned({
  items = [],
  pages = null,
}: {
  items?: RadarPayloadCard[];
  pages?: RadarCategoryPagesPayload | null;
}) {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [holdingOpen, setHoldingOpen] = useState(false);
  const [holdingItems, setHoldingItems] = useState<HoldingItem[]>([]);
  const [holdingLoading, setHoldingLoading] = useState(false);
  const [holdingError, setHoldingError] = useState<string | null>(null);
  const [tileTarget, setTileTarget] = useState<TileSheetTarget | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(pages?.favoriteIds ?? []),
  );

  // Server payload is the source of truth — re-sync after router.refresh().
  useEffect(() => {
    setFavoriteIds(new Set(pages?.favoriteIds ?? []));
  }, [pages]);

  const date = useMemo(() => formatToday(), []);
  const cards = useMemo(() => items.map(adaptRadarToCard), [items]);

  const activeFilter = FILTERS[selectedIndex] ?? "All";
  const activeKey = FILTER_TO_KEY[activeFilter];
  const heldCount = pages?.pages[activeKey]?.heldCount ?? 0;

  // Only the content below the header/tabs swipes between filters. The wrapper
  // carries data-no-embla-drag so the outer page carousel ignores these drags.
  const [innerRef, innerApi] = useEmblaCarousel({
    loop: false,
    align: "start",
    containScroll: "trimSnaps",
    dragFree: false,
    duration: 22,
  });

  useEffect(() => {
    if (!innerApi) return;
    function onSelect(api: EmblaApi) {
      setSelectedIndex(api.selectedScrollSnap());
    }
    innerApi.on("select", onSelect);
    return () => {
      innerApi.off("select", onSelect);
    };
  }, [innerApi]);

  const onFilterTap = useCallback(
    (filter: Filter) => {
      const idx = FILTERS.indexOf(filter);
      if (idx < 0) return;
      setSelectedIndex(idx);
      innerApi?.scrollTo(idx);
    },
    [innerApi],
  );

  function cardsFor(filter: Filter): Card[] {
    if (filter === "All") return cards;
    return cards.filter((c) => c.filter === filter);
  }

  async function loadHolding(openSheet = false) {
    if (openSheet) setHoldingOpen(true);
    setHoldingLoading(true);
    setHoldingError(null);
    try {
      const res = await fetch("/api/items/holding");
      const json = (await res.json().catch(() => ({}))) as {
        count?: number;
        items?: HoldingItem[];
        error?: string;
      };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      setHoldingItems(json.items ?? []);
    } catch (error) {
      setHoldingError(error instanceof Error ? error.message : "Could not load Holding.");
    } finally {
      setHoldingLoading(false);
    }
  }

  function refreshAfterAction() {
    router.refresh();
    void loadHolding();
  }

  async function toggleFavorite(id: string, next: boolean) {
    setFavoriteIds((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(id);
      else updated.delete(id);
      return updated;
    });
    try {
      const res = await fetch(`/api/items/${id}/${next ? "favorite" : "unfavorite"}`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (error) {
      setFavoriteIds((prev) => {
        const updated = new Set(prev);
        if (next) updated.delete(id);
        else updated.add(id);
        return updated;
      });
      console.error("favorite toggle failed", error);
    }
  }

  function onTileTap(filter: Filter, tile: { key: GlanceTileKey; label: string }) {
    // HELD opens the deferred Holding collection with its own actions.
    if (tile.key === "held") {
      void loadHolding(true);
      return;
    }
    setTileTarget({ filter: FILTER_TO_KEY[filter], tile: tile.key, label: tile.label });
  }

  return (
    <div
      className="lux-page relative mx-auto flex w-full max-w-[440px] flex-col overflow-hidden text-warm-ivory"
      style={{ height: "100dvh" }}
    >
      {/* Pinned: title block + filter tabs. Stays put while filters swipe. */}
      <div
        className="shrink-0 px-6"
        style={{ paddingTop: "calc(var(--safe-top) + 16px)" }}
      >
        <RadarCategoryHeader
          filter={activeKey}
          date={date}
          heldCount={heldCount}
          onHeldTap={() => void loadHolding(true)}
        />
        <FilterRow active={activeFilter} onChange={onFilterTap} />
      </div>

      {/* Swipeable: only the content below the tabs moves between filters. */}
      <div
        ref={innerRef}
        data-no-embla-drag
        className="min-h-0 flex-1 overflow-hidden"
      >
        <div className="flex h-full" style={{ touchAction: "pan-y pinch-zoom" }}>
          {FILTERS.map((filter) => (
            <div
              key={filter}
              className="min-w-0 flex-[0_0_100%] overflow-y-auto px-6"
              style={{ overscrollBehavior: "contain" }}
            >
              <CategoryPage
                filter={FILTER_TO_KEY[filter]}
                data={pages?.pages[FILTER_TO_KEY[filter]]}
                cards={cardsFor(filter)}
                favoriteIds={favoriteIds}
                onTileTap={(tile) => onTileTap(filter, tile)}
                onToggleFavorite={toggleFavorite}
                onViewAllSaved={() =>
                  setTileTarget({
                    filter: FILTER_TO_KEY[filter],
                    tile: "saved",
                    label: "SAVED",
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <HoldingSheet
        open={holdingOpen}
        items={holdingItems}
        loading={holdingLoading}
        error={holdingError}
        onClose={() => setHoldingOpen(false)}
        onItemsChange={(nextItems) => setHoldingItems(nextItems)}
        onMoveBack={() => refreshAfterAction()}
        onPersistedAction={refreshAfterAction}
      />
      <TileListSheet
        target={tileTarget}
        favoriteIds={favoriteIds}
        onToggleFavorite={toggleFavorite}
        onClose={() => setTileTarget(null)}
      />
    </div>
  );
}

function FilterRow({
  active,
  onChange,
}: {
  active: Filter;
  onChange: (f: Filter) => void;
}) {
  return (
    <nav
      aria-label="Radar filters"
      data-no-embla-drag
      className="mt-6 -mx-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ touchAction: "pan-x" }}
    >
      <ul className="flex items-center gap-7 border-b border-white/[0.06] pb-3">
        {FILTERS.map((f) => {
          const isActive = f === active;
          return (
            <li key={f}>
              <button
                type="button"
                onClick={() => onChange(f)}
                className={
                  "relative pb-3 text-[11px] uppercase tracking-[0.2em] transition-opacity duration-300 ease-atmospheric " +
                  (isActive
                    ? "text-warm-ivory"
                    : "text-warm-ivory/35 hover:text-warm-ivory/70")
                }
              >
                {f}
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute -bottom-[13px] left-0 h-px w-full bg-muted-gold"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HoldingSheet({
  open,
  items,
  loading,
  error,
  onClose,
  onItemsChange,
  onMoveBack,
  onPersistedAction,
}: {
  open: boolean;
  items: HoldingItem[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onItemsChange: (items: HoldingItem[]) => void;
  onMoveBack: (itemId: string) => void;
  onPersistedAction: () => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!open) return null;

  async function runAction(item: HoldingItem, action: "move-radar" | "pass") {
    if (pendingId) return;
    const previous = items;
    setPendingId(item.id);
    setActionError(null);
    onItemsChange(items.filter((entry) => entry.id !== item.id));
    try {
      const res = await fetch(`/api/items/${item.id}/${action}`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      if (action === "move-radar") onMoveBack(item.id);
      else onPersistedAction();
    } catch (err) {
      onItemsChange(previous);
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-0"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Holding"
        className="max-h-[78dvh] w-full max-w-[440px] overflow-hidden rounded-t-[22px] border border-white/[0.08] bg-[#0B0B0B] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="font-serif text-[24px] italic leading-tight text-warm-ivory">
              Holding
            </h2>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-warm-ivory/38">
              {items.length} held
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full text-[18px] text-warm-ivory/38 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/70"
            aria-label="Close Holding"
          >
            x
          </button>
        </div>
        <div className="max-h-[calc(78dvh-88px)] overflow-y-auto px-5 py-4">
          {error || actionError ? (
            <div className="mb-3 rounded-[var(--radius-soft)] border border-[#E07A6E]/20 bg-[#E07A6E]/5 px-3 py-2 text-[11px] text-[#E07A6E]">
              {actionError ?? error}
            </div>
          ) : null}
          {loading ? (
            <div className="py-10 text-center text-[12px] uppercase tracking-[0.2em] text-warm-ivory/35">
              Loading
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center font-serif text-[22px] italic text-warm-ivory/55">
              Nothing is waiting.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {items.map((item) => (
                <article key={item.id} className="py-4">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-muted-gold/65">
                    {item.category}
                  </div>
                  <h3 className="mt-2 font-serif text-[22px] leading-[1.08] text-warm-ivory">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-[1.45] text-warm-ivory/58">
                    {item.body}
                  </p>
                  {item.meta.length > 0 ? (
                    <div className="mt-3 text-[9px] uppercase leading-[1.5] tracking-[0.18em] text-warm-ivory/35">
                      {item.meta.slice(0, 2).join(" · ")}
                    </div>
                  ) : null}
                  <div className="mt-4 flex items-center gap-4">
                    <button
                      type="button"
                      disabled={Boolean(pendingId)}
                      onClick={() => void runAction(item, "move-radar")}
                      className="text-[10px] uppercase tracking-[0.2em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold disabled:opacity-40"
                    >
                      Back to Radar
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(pendingId)}
                      onClick={() => void runAction(item, "pass")}
                      className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/36 transition-colors duration-300 ease-atmospheric hover:text-[#E07A6E] disabled:opacity-40"
                    >
                      Pass
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
