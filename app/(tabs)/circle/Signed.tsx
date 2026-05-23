"use client";

import { useState } from "react";
import {
  AppFrame,
  Orbit,
  SectionLabel,
  type OrbitNode,
} from "@/components";
import { Chevron } from "@/components/icons";

const FILTERS = [
  "Homies",
  "Real Estate",
  "Creatives",
  "Faith",
  "Italy",
] as const;
type Filter = (typeof FILTERS)[number];

// TODO(intelligence): Replace signed Circle people/updates with CirclePayload
// from routeIntelligence once the relationship graph reads from Supabase.
const ORBIT_NODES: OrbitNode[] = [
  { id: "marco", name: "Marco Calvani", recency: "3w", x: 0, y: -1, faded: true, size: 48 },
  { id: "elena", name: "Elena Rossi", role: "Designer", recency: "2d", x: -0.7, y: -0.45, size: 60 },
  { id: "miles", name: "Miles Carter", role: "Producer", recency: "1d", x: 0.7, y: -0.45, size: 60 },
  { id: "lucia", name: "Lucia Moretti", recency: "2m", x: -1.05, y: 0.1, faded: true, size: 44 },
  { id: "noah", name: "Noah Bennett", recency: "5d", x: 1.05, y: 0.1, faded: true, size: 44 },
  { id: "niko", name: "Niko Alvarez", role: "Filmmaker", recency: "3d", x: -0.7, y: 0.55, size: 60 },
  { id: "simone", name: "Simone Park", role: "DJ", recency: "4d", x: 0.7, y: 0.55, size: 60 },
  { id: "adrian", name: "Adrian Foke", recency: "3m", x: 0, y: 1, faded: true, size: 48 },
];

const UPDATES: {
  id: string;
  name: string;
  role: string;
  note: string;
  date: string;
}[] = [
  {
    id: "u1",
    name: "Elena Rossi",
    role: "Designer",
    note: "Asked about the next Velour drop. Should send the lookbook.",
    date: "May 15",
  },
  {
    id: "u2",
    name: "Miles Carter",
    role: "Producer",
    note: "Sent the new track. Hasn’t replied — worth a nudge.",
    date: "May 14",
  },
  {
    id: "u3",
    name: "Niko Alvarez",
    role: "Filmmaker",
    note: "You’ve been meaning to introduce him to Marco — make it happen.",
    date: "May 13",
  },
  {
    id: "u4",
    name: "Simone Park",
    role: "DJ",
    note: "Hasn’t sent over the masters yet. Light reminder.",
    date: "May 12",
  },
];

export function CircleSigned() {
  const [filter, setFilter] = useState<Filter>("Creatives");

  return (
    <AppFrame>
      <header className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
          <h1 className="font-serif text-[56px] italic leading-[1.02] tracking-[-0.01em] text-warm-ivory">
            Circle
          </h1>
          <span className="self-start pt-[10px] text-[11px] uppercase tracking-[0.16em] text-warm-ivory/58">
            May 17, 2025
          </span>
        </div>
        <p className="max-w-[42ch] text-[16px] leading-[1.5] text-warm-ivory/62">
          The people shaping your taste and creative work.
        </p>
        <div className="h-px w-8 bg-muted-gold/35" />
      </header>

      <FilterRow active={filter} onChange={setFilter} />

      <div
        key={filter}
        className="mt-6"
        style={{ animation: "cross-fade 200ms var(--ease-atmospheric)" }}
      >
        <Orbit
          size={360}
          center={
            <div
              className="flex items-center justify-center rounded-full border border-muted-gold/70"
              style={{
                width: 84,
                height: 84,
                background:
                  "radial-gradient(circle at 50% 40%, #1c1c1f 0%, #0a0a0b 80%)",
                boxShadow: "0 0 24px rgba(184,146,74,0.18)",
              }}
            >
              <span className="font-serif text-[26px] leading-none text-warm-ivory">
                J.
              </span>
            </div>
          }
          nodes={ORBIT_NODES}
        />
      </div>

      <section className="mt-8 flex flex-col">
        <SectionLabel>Updates</SectionLabel>
        <ul className="lux-surface mt-3 flex flex-col overflow-hidden rounded-[var(--radius-card)]">
          {UPDATES.map((u, i) => (
            <UpdateRow key={u.id} {...u} divider={i !== UPDATES.length - 1} />
          ))}
        </ul>

        <button
          type="button"
          className="mt-5 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-warm-ivory/55 transition-opacity duration-300 ease-atmospheric hover:text-warm-ivory/80"
        >
          <span>Add Note</span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.1] text-base leading-none text-warm-ivory/70">
            +
          </span>
        </button>
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
      aria-label="Circle filters"
      data-no-embla-drag
      className="mt-6 -mx-6 overflow-x-auto px-6"
      style={{ touchAction: "pan-x" }}
    >
      <ul className="flex items-center gap-7">
        {FILTERS.map((f) => {
          const isActive = f === active;
          return (
            <li key={f} className="shrink-0">
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

function UpdateRow({
  name,
  role,
  note,
  date,
  divider,
}: {
  name: string;
  role: string;
  note: string;
  date: string;
  divider: boolean;
}) {
  return (
    <li
      className={
        "grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-4 " +
        (divider ? "border-b border-white/[0.065]" : "")
      }
    >
      <div
        aria-hidden
        className="h-11 w-11 rounded-full border border-muted-gold/60"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(246,239,221,0.12) 0%, #141411 70%, #090908 100%)",
        }}
      />
      <div className="min-w-0">
        <div className="font-serif text-[17px] italic leading-tight text-warm-ivory">
          {name}
        </div>
        <div className="mt-0.5 text-[10px] uppercase tracking-editorial text-muted-gold/85">
          {role}
        </div>
        <p className="mt-2 text-[14px] leading-[1.45] text-warm-ivory/66">
          {note}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-1 text-[11px] uppercase tracking-editorial text-warm-ivory/45">
        {date}
        <Chevron direction="right" size={12} />
      </div>
    </li>
  );
}
