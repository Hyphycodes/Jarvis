"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppFrame } from "@/components";
import type { RadarCard as RadarPayloadCard } from "@/lib/ai/types";

const FILTERS = [
  "All",
  "Moves",
  "Events",
  "Dining",
  "Culture",
  "Places",
  "Style",
] as const;
type Filter = (typeof FILTERS)[number];

type Card = {
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
};

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
  // A real area to show — but never the venue name again (it's already the
  // title). This kills the "THE PROMONTORY / THE PROMONTORY" stacking.
  const area = distinctFromTitle(item.neighborhood ?? item.locationLabel, title);
  // Meta line is for time-bound signal (events). Places don't repeat the venue.
  const meta = [formatMeta(item.datetime)].filter(
    (value): value is string => Boolean(value),
  );
  // Footer reads like the brief: where + what it costs, deduped, no internals.
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
      return "Style";
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
      return "STYLE";
    case "product":
      return "PRODUCT";
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
    default:
      return "MOVE";
  }
}

function formatMeta(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .toUpperCase();
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

export function RadarSigned({ items = [] }: { items?: RadarPayloadCard[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("All");
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [holdingOpen, setHoldingOpen] = useState(false);
  const [holdingItems, setHoldingItems] = useState<HoldingItem[]>([]);
  const [holdingCount, setHoldingCount] = useState(0);
  const [holdingLoading, setHoldingLoading] = useState(false);
  const [holdingError, setHoldingError] = useState<string | null>(null);

  const cards = useMemo(() => {
    return items.map(adaptRadarToCard);
  }, [items]);

  const visible = cards.filter(
    (c) =>
      !dismissed[c.id] && (filter === "All" || c.filter === filter),
  );

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
      const nextItems = json.items ?? [];
      setHoldingItems(nextItems);
      setHoldingCount(json.count ?? nextItems.length);
    } catch (error) {
      setHoldingError(error instanceof Error ? error.message : "Could not load Holding.");
    } finally {
      setHoldingLoading(false);
    }
  }

  useEffect(() => {
    void loadHolding();
  }, []);

  function dismissCard(id: string) {
    setActionErrors((errors) => {
      const next = { ...errors };
      delete next[id];
      return next;
    });
    setDismissed((current) => ({ ...current, [id]: true }));
  }

  function restoreCard(id: string, message: string) {
    setDismissed((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setActionErrors((errors) => ({ ...errors, [id]: message }));
  }

  function refreshAfterAction() {
    router.refresh();
    void loadHolding();
  }

  return (
    <AppFrame>
      <header className="flex flex-col gap-3 pt-6">
        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
          <h1 className="font-serif text-[52px] italic leading-[1.02] tracking-[-0.005em] text-warm-ivory">
            Radar
          </h1>
          <div className="self-start pt-[8px] text-right">
            <span className="block text-[11px] uppercase tracking-[0.16em] text-warm-ivory/55">
              {formatToday()}
            </span>
            <button
              type="button"
              onClick={() => void loadHolding(true)}
              className="mt-2 text-[10px] uppercase tracking-[0.18em] text-warm-ivory/40 transition-colors duration-300 ease-atmospheric hover:text-muted-gold"
            >
              {holdingCount} held
            </button>
          </div>
        </div>
        <p className="max-w-[42ch] text-[15px] leading-[1.55] text-warm-ivory/62">
          Curated signal for your taste and trajectory.
          <br />
          Not everything. Just what&apos;s worth your time.
        </p>
        <div className="h-px w-8 bg-muted-gold/30" />
      </header>

      <FilterRow active={filter} onChange={setFilter} />

      <section
        key={filter}
        className="mt-6 flex flex-col gap-5"
        style={{ animation: "cross-fade 200ms var(--ease-atmospheric)" }}
      >
        {cards.length === 0 ? (
          <RadarEmptyState />
        ) : visible.length === 0 ? (
          <div
            className="py-16 text-center font-serif italic"
            style={{
              color: "var(--text-muted)",
              fontSize: "22px",
              lineHeight: 1.3,
            }}
          >
            Nothing made the cut.
          </div>
        ) : (
          visible.map((card) => (
            <RadarCard
              key={card.id}
              card={card}
              error={actionErrors[card.id]}
              onDismiss={() => dismissCard(card.id)}
              onRestore={(message) => restoreCard(card.id, message)}
              onPersistedAction={refreshAfterAction}
            />
          ))
        )}
      </section>
      <HoldingSheet
        open={holdingOpen}
        items={holdingItems}
        loading={holdingLoading}
        error={holdingError}
        onClose={() => setHoldingOpen(false)}
        onItemsChange={(nextItems) => {
          setHoldingItems(nextItems);
          setHoldingCount(nextItems.length);
        }}
        onMoveBack={(itemId) => {
          setDismissed((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          refreshAfterAction();
        }}
        onPersistedAction={refreshAfterAction}
      />
    </AppFrame>
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
      className="mt-8 -mx-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ touchAction: "pan-x" }}
    >
      <ul className="flex items-center gap-7">
        {FILTERS.map((f) => {
          const isActive = f === active;
          return (
            <li key={f}>
              <button
                type="button"
                onClick={() => onChange(f)}
                className={
                  "relative pb-1.5 text-[11px] uppercase tracking-[0.2em] transition-opacity duration-300 ease-atmospheric " +
                  (isActive
                    ? "text-warm-ivory"
                    : "text-warm-ivory/35 hover:text-warm-ivory/70")
                }
              >
                {f}
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute -bottom-0 left-0 h-px w-full bg-muted-gold"
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

function RadarCard({
  card,
  error,
  onDismiss,
  onRestore,
  onPersistedAction,
}: {
  card: Card;
  error?: string;
  onDismiss: () => void;
  onRestore: (message: string) => void;
  onPersistedAction: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hasMedia = Boolean(card.imageUrl) || Boolean(card.placeholderKind);

  function persist(action: "save" | "move-holding") {
    onDismiss();
    startTransition(async () => {
      try {
        const res = await fetch(`/api/items/${card.id}/${action}`, { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok || json.error) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        onPersistedAction();
        if (action === "save") {
          router.push(card.planSlug ? `/plan/${card.planSlug}` : `/item/${card.id}`);
        }
      } catch (err) {
        onRestore(err instanceof Error ? err.message : "Action failed.");
        console.error("radar action failed", err);
      }
    });
  }

  function generatePlan() {
    onDismiss();
    startTransition(async () => {
      try {
        const res = await fetch(`/api/items/${card.id}/generate-plan`, { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as {
          plan_slug?: string;
          error?: string;
        };
        if (!res.ok || json.error || !json.plan_slug) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        onPersistedAction();
        router.push(`/plan/${json.plan_slug}`);
      } catch (err) {
        onRestore(err instanceof Error ? err.message : "Action failed.");
        console.error("radar plan generation failed", err);
      }
    });
  }

  function handleGo(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    if (card.canGeneratePlan) {
      generatePlan();
      return;
    }
    persist("save");
  }

  function handleOpenCard(e: React.MouseEvent) {
    if (pending || card.planSlug || !card.canGeneratePlan) return;
    e.preventDefault();
    generatePlan();
  }

  function handleWait(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    persist("move-holding");
  }

  return (
    <article
      className="lux-surface overflow-hidden rounded-[var(--radius-card)] transition-opacity duration-500 ease-atmospheric"
    >
      <Link
        href={card.planSlug ? `/plan/${card.planSlug}` : `/item/${card.id}`}
        onClick={handleOpenCard}
        className="block transition-colors duration-300 ease-atmospheric hover:bg-white/[0.012]"
        aria-label={`Open ${card.title}`}
      >
        <div
          className={
            hasMedia
              ? "grid gap-4 p-5 sm:grid-cols-[1fr_140px]"
              : "p-5"
          }
        >
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-gold/80">
              {card.category}
            </div>
            <h2 className="mt-3 font-serif text-[28px] leading-[1.06] tracking-[-0.005em] text-warm-ivory">
              {card.title}
            </h2>
            <p className="mt-3 text-[14px] leading-[1.5] text-warm-ivory/68">
              {card.body}
            </p>
            {card.whoLine ? (
              <p className="mt-2 text-[13px] leading-[1.45] text-warm-ivory/50">
                {card.whoLine}
              </p>
            ) : null}
            {card.meta.length > 0 ? (
              <div className="mt-4 text-[10px] uppercase leading-[1.55] tracking-[0.2em] text-warm-ivory/40">
                {card.meta[0]}
              </div>
            ) : null}
            {card.footerLine ? (
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-gold/55">
                {card.footerLine}
              </div>
            ) : null}
          </div>

          {hasMedia ? (
            <CardMedia
              placeholderKind={card.placeholderKind}
              imageUrl={card.imageUrl}
              title={card.title}
            />
          ) : null}
        </div>
      </Link>

      {error ? (
        <div className="border-t border-[#E07A6E]/20 px-5 py-2 text-[11px] text-[#E07A6E]">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 border-t border-white/[0.045]">
        <button
          type="button"
          onClick={handleGo}
          disabled={pending}
          className="border-r border-white/[0.045] py-4 text-[11px] uppercase tracking-[0.22em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold disabled:opacity-60"
        >
          Go
        </button>
        <button
          type="button"
          onClick={handleWait}
          disabled={pending}
          className="py-4 text-[11px] uppercase tracking-[0.22em] text-warm-ivory/50 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80 disabled:opacity-60"
        >
          Wait
        </button>
      </div>
    </article>
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

function RadarEmptyState() {
  return (
    <div className="border-t border-white/[0.06] pt-16 pb-12">
      <div className="max-w-[34ch]">
        <h2 className="font-serif text-[32px] italic leading-tight text-warm-ivory">
          Nothing made the cut.
        </h2>
        <p className="mt-4 text-[14px] leading-[1.55] text-warm-ivory/58">
          Jarvis checked the board. Nothing strong enough to interrupt the day.
        </p>
      </div>
    </div>
  );
}

function CardMedia({
  imageUrl,
  title,
  placeholderKind,
}: {
  imageUrl?: string;
  title: string;
  placeholderKind?: Card["placeholderKind"];
}) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      <div className="aspect-[4/5] overflow-hidden rounded-[var(--radius-soft)] border border-white/[0.055] bg-charcoal sm:aspect-auto sm:h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className="aspect-[4/5] overflow-hidden rounded-[var(--radius-soft)] border border-white/[0.055] bg-charcoal sm:aspect-auto sm:h-full"
      style={{
        backgroundImage: placeholderGradient(placeholderKind),
      }}
    >
      <div className="flex h-full items-end p-3 text-[9px] uppercase tracking-[0.22em] text-muted-gold/45">
        {placeholderKind ?? "signal"}
      </div>
    </div>
  );
}

function placeholderGradient(kind?: Card["placeholderKind"]): string {
  switch (kind) {
    case "product":
      return "radial-gradient(ellipse at 60% 25%, rgba(201,169,110,0.18), transparent 52%), linear-gradient(180deg, #202023, #0A0A0B)";
    case "event":
      return "radial-gradient(ellipse at 45% 35%, rgba(123,154,196,0.16), transparent 54%), linear-gradient(180deg, #1B1B20, #08080A)";
    case "place":
    case "activity":
      return "radial-gradient(ellipse at 45% 45%, rgba(184,146,74,0.16), transparent 56%), linear-gradient(180deg, #1A1A1C, #09090A)";
    case "idea":
      return "radial-gradient(ellipse at 30% 30%, rgba(255,250,240,0.10), transparent 55%), linear-gradient(180deg, #1B1B1B, #090909)";
    default:
      return "linear-gradient(180deg, rgba(184,146,74,0.10), transparent 62%), linear-gradient(180deg, #19191B, #08080A)";
  }
}
