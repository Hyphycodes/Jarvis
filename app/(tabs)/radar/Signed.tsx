"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppFrame } from "@/components";
import type { RadarCard as RadarPayloadCard } from "@/lib/ai/types";

const FILTERS = [
  "All",
  "Events",
  "Dining",
  "Culture",
  "Places",
  "Sports",
] as const;
type Filter = (typeof FILTERS)[number];

type Card = {
  id: string;
  category: "DINING" | "CULTURE" | "PLACES" | "EVENTS" | "SPORTS";
  title: string;
  body: string;
  meta: string[];
  sourceLine: string;
  statusLine: string;
  planSlug?: string;
  filter: Filter;
  media: "stacked" | "portrait" | "landscape";
};

function adaptRadarToCard(item: RadarPayloadCard, idx: number): Card {
  const filter = mapCategoryToFilter(item.category);
  const media = ["stacked", "portrait", "landscape"][idx % 3] as Card["media"];
  const meta = [
    item.neighborhood,
    formatMeta(item.datetime),
    item.whyNow,
  ].filter((value): value is string => Boolean(value));
  return {
    id: item.id,
    category: mapCategoryToBadge(item.category),
    title: item.title,
    body: item.summary || item.whyItFits || "Worth a closer look.",
    meta,
    sourceLine: [item.source, item.type].filter(Boolean).join(" · "),
    statusLine: [item.destination, item.status].filter(Boolean).join(" · "),
    planSlug: item.planSlug,
    filter,
    media,
  };
}

function mapCategoryToFilter(category: string): Filter {
  switch (category.toLowerCase()) {
    case "dining":
      return "Dining";
    case "events":
    case "event":
      return "Events";
    case "culture":
      return "Culture";
    case "places":
    case "place":
      return "Places";
    case "sports":
      return "Sports";
    case "music":
      return "Events";
    default:
      return "All";
  }
}

function mapCategoryToBadge(category: string): Card["category"] {
  switch (category.toLowerCase()) {
    case "dining":
      return "DINING";
    case "culture":
      return "CULTURE";
    case "events":
    case "event":
      return "EVENTS";
    case "sports":
      return "SPORTS";
    case "music":
      return "CULTURE";
    case "style":
    case "travel":
    case "opportunity":
      return "PLACES";
    default:
      return "PLACES";
  }
}

function formatMeta(iso?: string): string {
  if (!iso) return "OPEN WINDOW";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "OPEN WINDOW";
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
          <span className="self-start pt-[10px] text-[12px] uppercase tracking-editorial text-warm-ivory/60">
            {formatToday()}
          </span>
        </div>
        <p className="max-w-[42ch] text-[15px] leading-[1.55] text-warm-ivory/65">
          Curated signal for your taste and trajectory.
          <br />
          Not everything. Just what&apos;s worth your time.
        </p>
        <div className="h-px w-8 bg-muted-gold/40" />
      </header>

      <FilterRow active={filter} onChange={setFilter} />

      <section
        key={filter}
        className="mt-6 flex flex-col gap-6"
        style={{ animation: "cross-fade 200ms var(--ease-atmospheric)" }}
      >
        {cards.length === 0 ? (
          <RadarEmptyState />
        ) : visible.length === 0 ? (
          <div className="py-12 text-center text-[13px] uppercase tracking-editorial text-warm-ivory/40">
            Nothing in this lane
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
      className="mt-8 -mx-6 overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  "relative pb-1.5 text-[11px] uppercase tracking-editorial transition-opacity duration-300 ease-atmospheric " +
                  (isActive
                    ? "text-warm-ivory"
                    : "text-warm-ivory/35 hover:text-warm-ivory/70")
                }
              >
                {f}
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute -bottom-0 left-0 h-[2px] w-full bg-muted-gold"
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
        "border-t border-white/[0.08] bg-soft-black transition-opacity duration-500 ease-atmospheric " +
        (passing ? "fade-up-out" : "opacity-100")
      }
    >
      <Link
        href={`/item/${card.id}`}
        className="grid grid-cols-[1fr_42%] transition-colors duration-300 ease-atmospheric hover:bg-white/[0.012]"
        aria-label={`Open ${card.title}`}
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
              {card.category}
            </span>
            {card.sourceLine ? (
              <span className="text-[10px] uppercase tracking-editorial text-warm-ivory/35">
                {card.sourceLine}
              </span>
            ) : null}
          </div>
          <h2 className="font-serif text-[32px] font-normal leading-[1.05] tracking-[-0.01em] text-warm-ivory">
            {card.title}
          </h2>
          <div className="h-px w-6 bg-muted-gold/50" />
          <p className="max-w-[28ch] text-[14px] leading-[1.55] text-warm-ivory/75">
            {card.body}
          </p>
          <div className="mt-2 text-[10px] uppercase leading-[1.6] tracking-editorial text-warm-ivory/45">
            {card.meta.slice(0, 3).map((line) => (
              <div key={line}>{line}</div>
            ))}
            {card.statusLine ? (
              <div className="text-muted-gold/60">{card.statusLine}</div>
            ) : null}
          </div>
        </div>
        <CardMedia kind={card.media} />
      </Link>
      {error ? (
        <div className="border-t border-[#E07A6E]/20 px-4 py-2 text-[11px] text-[#E07A6E]">
          {error}
        </div>
      ) : null}
      <div className={`grid border-t border-white/[0.06] ${card.planSlug ? "grid-cols-3" : "grid-cols-2"}`}>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="border-r border-white/[0.06] py-4 text-[11px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold disabled:opacity-60"
        >
          {saved ? "✓" : "Save"}
        </button>
        {card.planSlug ? (
          <Link
            href={`/plan/${card.planSlug}`}
            className="border-r border-white/[0.06] py-4 text-center text-[11px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
          >
            View plan
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handlePass}
          disabled={pending}
          className="py-4 text-[11px] uppercase tracking-editorial text-warm-ivory/50 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80 disabled:opacity-60"
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
          Nothing on Radar yet
        </h2>
        <p className="mt-3 text-[14px] leading-[1.55] text-warm-ivory/58">
          Refresh Radar from Intelligence when you want Jarvis to pull new
          candidates into view.
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

function CardMedia({ kind }: { kind: Card["media"] }) {
  if (kind === "stacked") {
    return (
      <div className="grid h-full grid-rows-[1fr_1.2fr] gap-1 bg-charcoal/40">
        <div
          aria-hidden
          className="bg-charcoal"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 30% 40%, rgba(184,146,74,0.10), transparent 60%), linear-gradient(180deg, #1A1A1C, #0F0F11)",
          }}
        />
        <div
          aria-hidden
          className="bg-charcoal"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 60% 70%, rgba(201,169,110,0.10), transparent 55%), linear-gradient(180deg, #141416, #0B0B0D)",
          }}
        />
      </div>
    );
  }
  if (kind === "portrait") {
    return (
      <div
        aria-hidden
        className="h-full min-h-[260px] bg-charcoal"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 30%, rgba(232,228,168,0.06), transparent 60%), linear-gradient(180deg, #1B1B1E 0%, #0C0C0E 100%)",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="h-full min-h-[200px] bg-charcoal"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(184,146,74,0.08), transparent 60%), linear-gradient(180deg, #1A1A1C, #0B0B0D)",
      }}
    />
  );
}
