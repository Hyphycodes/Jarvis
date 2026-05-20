"use client";

import { useState, type ReactNode } from "react";
import { AppFrame, BottomNav } from "@/components";

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
  title: ReactNode;
  body: string;
  meta: [string, string];
  filter: Filter;
  media: "stacked" | "portrait" | "landscape";
};

const CARDS: Card[] = [
  {
    id: "sparrow",
    category: "DINING",
    title: (
      <>
        Sparrow
        <br />
        Tonight
      </>
    ),
    body: "New jazz trio residency. Low light, outstanding bourbon, late kitchen.",
    meta: ["WEST LOOP", "8:30PM"],
    filter: "Dining",
    media: "stacked",
  },
  {
    id: "lynch",
    category: "CULTURE",
    title: (
      <>
        David Lynch
        <br />
        Retrospective
      </>
    ),
    body: "Week-long screening of unreleased works and interviews.",
    meta: ["MUSIC BOX THEATRE", "STARTS MAY 19"],
    filter: "Culture",
    media: "portrait",
  },
  {
    id: "umbria",
    category: "PLACES",
    title: (
      <>
        Umbria Property
        <br />
        Intel
      </>
    ),
    body: "Prices softened 2.1% this month. Several off-market listings worth review.",
    meta: ["UMBRIA, ITALY", "MARKET UPDATE"],
    filter: "Places",
    media: "landscape",
  },
];

export default function RadarPage() {
  const [filter, setFilter] = useState<Filter>("All");
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  const visible = CARDS.filter(
    (c) =>
      !dismissed[c.id] && (filter === "All" || c.filter === filter),
  );

  return (
    <AppFrame>
      <header className="flex flex-col gap-4">
        <div className="relative">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-[56px] italic leading-[1.02] tracking-[-0.01em] text-warm-ivory">
              Radar
            </h1>
            <span
              aria-hidden
              className="pulse-dot mt-3 inline-block h-1.5 w-1.5 rounded-full bg-muted-gold"
            />
          </div>
          <span className="absolute right-0 top-[18px] text-[12px] uppercase tracking-editorial text-warm-ivory/60">
            May 17, 2025
          </span>
        </div>
        <p className="max-w-[42ch] text-[15px] leading-[1.55] text-warm-ivory/65">
          Curated signal for your taste and trajectory.
          <br />
          Not everything. Just what’s worth your time.
        </p>
        <div className="h-px w-8 bg-muted-gold/40" />
      </header>

      <FilterRow active={filter} onChange={setFilter} />

      <section
        key={filter}
        className="mt-6 flex flex-col gap-6"
        style={{ animation: "cross-fade 200ms var(--ease-atmospheric)" }}
      >
        {visible.map((card) => (
          <RadarCard
            key={card.id}
            card={card}
            onPass={() =>
              setTimeout(
                () => setDismissed((d) => ({ ...d, [card.id]: true })),
                600,
              )
            }
          />
        ))}
        {visible.length === 0 ? (
          <div className="py-12 text-center text-[13px] uppercase tracking-editorial text-warm-ivory/40">
            Nothing on the radar
          </div>
        ) : null}
      </section>

      <BottomNav active="Radar" />
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
  onPass,
}: {
  card: Card;
  onPass: () => void;
}) {
  const [passing, setPassing] = useState(false);
  const [saved, setSaved] = useState(false);

  function handlePass() {
    if (passing) return;
    setPassing(true);
    onPass();
  }
  function handleSave() {
    if (saved) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 1100);
  }

  return (
    <article
      className={
        "border-t border-white/[0.08] bg-soft-black transition-opacity duration-500 ease-atmospheric " +
        (passing ? "fade-up-out" : "opacity-100")
      }
    >
      <div className="grid grid-cols-[1fr_42%]">
        <div className="flex flex-col gap-4 p-4">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
            {card.category}
          </span>
          <h2 className="font-serif text-[32px] font-normal leading-[1.05] tracking-[-0.01em] text-warm-ivory">
            {card.title}
          </h2>
          <div className="h-px w-6 bg-muted-gold/50" />
          <p className="max-w-[28ch] text-[14px] leading-[1.55] text-warm-ivory/75">
            {card.body}
          </p>
          <div className="mt-2 text-[10px] uppercase leading-[1.6] tracking-editorial text-warm-ivory/45">
            {card.meta[0]}
            <br />
            {card.meta[1]}
          </div>
        </div>
        <CardMedia kind={card.media} />
      </div>
      <div className="grid grid-cols-2 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={handleSave}
          className="border-r border-white/[0.06] py-4 text-[11px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
        >
          {saved ? "✓" : "Save"}
        </button>
        <button
          type="button"
          onClick={handlePass}
          className="py-4 text-[11px] uppercase tracking-editorial text-warm-ivory/50 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/80"
        >
          Pass
        </button>
      </div>
    </article>
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
