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
  verdict?: string;
  verdictTone?: "positive" | "neutral" | "caution" | "negative";
  title: string;
  body: string;
  take?: string;
  purposeLabel?: string;
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
    verdict: item.verdictLabel,
    verdictTone: item.verdictTone,
    title: item.title,
    body: item.oneLine || item.summary || item.whyItFits || "Worth a closer look.",
    take: item.bestMoveTitle ?? item.jarvisTake,
    purposeLabel: item.purposeLabel,
    meta,
    footerLine: [
      item.effortLevel ? `Effort ${item.effortLevel}` : null,
      item.spendingPosture ? `Spend ${item.spendingPosture}` : null,
      item.confidenceLabel ? `${item.confidenceLabel} confidence` : null,
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
      <header className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-[56px] italic leading-[1.02] tracking-[-0.01em] text-warm-ivory">
              Radar
            </h1>
            <span
              aria-hidden
              className="pulse-dot mb-2 inline-block h-1.5 w-1.5 rounded-full bg-muted-gold"
            />
          </div>
          <span className="self-start pt-[10px] text-[11px] uppercase tracking-[0.16em] text-warm-ivory/58">
            {formatToday()}
          </span>
        </div>
        <p className="max-w-[42ch] text-[15px] leading-[1.55] text-warm-ivory/62">
          Curated signal for your taste and trajectory.
          <br />
          Not everything. Just what&apos;s worth your time.
        </p>
        <div className="h-px w-8 bg-muted-gold/35" />
      </header>

      <FilterRow active={filter} onChange={setFilter} />

      <section
        key={filter}
        className="mt-6 flex flex-col gap-4"
        style={{ animation: "cross-fade 200ms var(--ease-atmospheric)" }}
      >
        {cards.length === 0 ? (
          <RadarEmptyState />
        ) : visible.length === 0 ? (
          <div
            className="py-12 text-center font-serif italic"
            style={{
              color: "var(--text-muted)",
              fontSize: "20px",
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

  function handlePass() {
    if (passing) return;
    setPassing(true);
    persist("pass");
  }

  function handleSave() {
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
        className="grid grid-cols-[88px_1fr] gap-4 p-4 transition-colors duration-300 ease-atmospheric hover:bg-white/[0.012] sm:grid-cols-[112px_1fr]"
        aria-label={`Open ${card.title}`}
      >
        <CardMedia
          placeholderKind={card.placeholderKind}
          imageUrl={card.imageUrl}
          title={card.title}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {card.verdict ? (
              <span
                className={
                  "rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] " +
                  verdictClass(card.verdictTone)
                }
              >
                {card.verdict}
              </span>
            ) : null}
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-gold">
              {card.category}
            </span>
            {card.purposeLabel ? (
              <span className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/38">
                {card.purposeLabel}
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 font-serif text-[25px] font-normal leading-[1.08] tracking-[-0.01em] text-warm-ivory">
            {card.title}
          </h2>
          <p className="mt-2 text-[13px] leading-[1.45] text-warm-ivory/68">
            {card.body}
          </p>
          {card.take ? (
            <p className="mt-2 text-[12px] leading-[1.45] text-warm-ivory/50">
              {card.take}
            </p>
          ) : null}
          <div className="mt-3 text-[10px] uppercase leading-[1.55] tracking-[0.2em] text-warm-ivory/42">
            {card.meta.slice(0, 1).map((line) => (
              <span key={line}>{line}</span>
            ))}
            {card.footerLine ? (
              <div className="mt-1 text-muted-gold/60">{card.footerLine}</div>
            ) : null}
          </div>
        </div>
      </Link>
      {error ? (
        <div className="border-t border-[#E07A6E]/20 px-4 py-2 text-[11px] text-[#E07A6E]">
          {error}
        </div>
      ) : null}
      <div className={`grid border-t border-white/[0.065] ${card.planSlug ? "grid-cols-3" : "grid-cols-2"}`}>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="border-r border-white/[0.065] py-4 text-[11px] uppercase tracking-[0.2em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold disabled:opacity-60"
        >
          {saved ? "✓" : "Save"}
        </button>
        {card.planSlug ? (
          <Link
            href={`/plan/${card.planSlug}`}
            className="border-r border-white/[0.065] py-4 text-center text-[11px] uppercase tracking-[0.2em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
          >
            View plan
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handlePass}
          disabled={pending}
          className="py-4 text-[11px] uppercase tracking-[0.2em] text-warm-ivory/50 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80 disabled:opacity-60"
        >
          Pass
        </button>
      </div>
    </article>
  );
}

function RadarEmptyState() {
  return (
    <div className="border-t border-white/[0.08] py-12">
      <div className="max-w-[34ch]">
        <h2 className="font-serif text-[30px] leading-tight text-warm-ivory">
          Nothing made the cut.
        </h2>
        <p className="mt-3 text-[14px] leading-[1.55] text-warm-ivory/58">
          Jarvis checked the board. Nothing strong enough to interrupt the day.
        </p>
        <Link
          href="/account/intelligence"
          className="mt-5 inline-flex items-center text-[11px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
        >
          Open Intelligence →
        </Link>
      </div>
    </div>
  );
}

function verdictClass(tone?: Card["verdictTone"]): string {
  switch (tone) {
    case "positive":
      return "border-muted-gold/45 text-muted-gold";
    case "caution":
      return "border-[#D8A85B]/35 text-[#D8A85B]";
    case "negative":
      return "border-[#E07A6E]/35 text-[#E07A6E]";
    case "neutral":
    default:
      return "border-white/[0.12] text-warm-ivory/55";
  }
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
      <div className="aspect-[4/5] overflow-hidden rounded-[var(--radius-soft)] border border-white/[0.065] bg-charcoal">
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
      className="aspect-[4/5] overflow-hidden rounded-[var(--radius-soft)] border border-white/[0.065] bg-charcoal"
      style={{
        backgroundImage:
          placeholderGradient(placeholderKind),
      }}
    >
      <div className="flex h-full items-end p-3 text-[9px] uppercase tracking-[0.22em] text-muted-gold/55">
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
