"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
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
  meta: string[];
  footerLine: string;
  imageUrl?: string;
  placeholderKind?: RadarPayloadCard["placeholderKind"];
  planSlug?: string;
  filter: Filter;
};

function adaptRadarToCard(item: RadarPayloadCard): Card {
  const filter = mapCategoryToFilter(item.category);
  const meta = [
    formatMeta(item.datetime),
    item.neighborhood,
    item.whyNow,
  ].filter((value): value is string => Boolean(value));
  return {
    id: item.id,
    category: (item.displayCategory ?? mapCategoryToBadge(item.category)).toUpperCase(),
    title: item.title,
    body: item.oneLine || item.summary || item.whyItFits || "Worth a closer look.",
    meta,
    footerLine: [
      item.effortLevel ? `Effort ${item.effortLevel}` : null,
      item.spendingPosture ? `Spend ${item.spendingPosture}` : null,
      item.sourceDomain ?? item.locationLabel,
    ].filter(Boolean).join(" · "),
    imageUrl: item.imageUrl,
    placeholderKind: item.placeholderKind,
    planSlug: item.planSlug,
    filter,
  };
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

  const cards = useMemo(() => {
    return items.map(adaptRadarToCard);
  }, [items]);

  const visible = cards.filter(
    (c) =>
      !dismissed[c.id] && (filter === "All" || c.filter === filter),
  );

  return (
    <AppFrame>
      <header className="flex flex-col gap-3 pt-6">
        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
          <h1 className="font-serif text-[52px] italic leading-[1.02] tracking-[-0.005em] text-warm-ivory">
            Radar
          </h1>
          <span className="self-start pt-[8px] text-[11px] uppercase tracking-[0.16em] text-warm-ivory/55">
            {formatToday()}
          </span>
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
              onDismiss={() =>
                setDismissed((d) => ({ ...d, [card.id]: true }))
              }
              onPersistedAction={() => router.refresh()}
            />
          ))
        )}
      </section>
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
  onDismiss,
  onPersistedAction,
}: {
  card: Card;
  onDismiss: () => void;
  onPersistedAction: () => void;
}) {
  const [passing, setPassing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hasMedia = Boolean(card.imageUrl) || Boolean(card.placeholderKind);

  function persist(action: "save" | "pass") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/items/${card.id}/${action}`, { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok || json.error) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        setTimeout(onDismiss, action === "pass" ? 380 : 180);
        onPersistedAction();
      } catch (err) {
        setPassing(false);
        setSaved(false);
        setError((err as Error).message);
        console.error("radar action failed", err);
      }
    });
  }

  function handlePass(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (passing) return;
    setPassing(true);
    persist("pass");
  }

  function handleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (saved) return;
    setSaved(true);
    persist("save");
    setTimeout(() => setSaved(false), 1100);
  }

  return (
    <article
      className={
        "lux-surface overflow-hidden rounded-[var(--radius-card)] transition-opacity duration-500 ease-atmospheric " +
        (passing ? "fade-up-out" : "opacity-100")
      }
    >
      <Link
        href={`/item/${card.id}`}
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

      <div
        className={`grid border-t border-white/[0.045] ${
          card.planSlug ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="border-r border-white/[0.045] py-4 text-[11px] uppercase tracking-[0.22em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold disabled:opacity-60"
        >
          {saved ? "✓" : "Save"}
        </button>
        {card.planSlug ? (
          <Link
            href={`/plan/${card.planSlug}`}
            className="border-r border-white/[0.045] py-4 text-center text-[11px] uppercase tracking-[0.22em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
          >
            View plan
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handlePass}
          disabled={pending}
          className="py-4 text-[11px] uppercase tracking-[0.22em] text-warm-ivory/50 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80 disabled:opacity-60"
        >
          Pass
        </button>
      </div>
    </article>
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
        <Link
          href="/account/intelligence"
          className="mt-6 inline-flex items-center text-[11px] uppercase tracking-[0.2em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
        >
          Open Intelligence →
        </Link>
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
