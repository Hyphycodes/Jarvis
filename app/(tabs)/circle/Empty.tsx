"use client";

import { useState } from "react";
import Link from "next/link";
import { AppFrame } from "@/components";
import { dateLabel } from "@/lib/dateLabel";

const FILTERS = [
  "All",
  "Homies",
  "Real Estate",
  "Creatives",
  "Faith",
] as const;
type Filter = (typeof FILTERS)[number];

export function CircleEmpty() {
  const [active, setActive] = useState<Filter>("All");

  return (
    <AppFrame>
      <header className="flex flex-col gap-3 pt-6">
        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
          <h1 className="font-serif text-[52px] italic leading-[1.02] tracking-[-0.005em] text-warm-ivory">
            Circle
          </h1>
          <span className="self-start pt-[8px] text-[11px] uppercase tracking-[0.16em] text-warm-ivory/55">
            {dateLabel()}
          </span>
        </div>
        <p
          className="max-w-[42ch] text-[15px] font-light leading-[1.55]"
          style={{ color: "#9a9080" }}
        >
          Your inner circle. Key relationships
          <br />
          and recent context.
        </p>
        <div className="h-px w-8 bg-muted-gold/30" />
      </header>

      <FilterRow active={active} onChange={setActive} />

      <CircleSkeleton />

      <div className="motion-card mt-8 flex flex-col items-center text-center">
        <span aria-hidden className="block text-[14px] text-muted-gold/85">
          ✦
        </span>
        <h2 className="mt-3 font-serif text-[26px] leading-[1.15] tracking-[-0.005em] text-warm-ivory">
          Your circle will take shape.
        </h2>
        <p className="mt-2 max-w-[34ch] text-[13px] leading-[1.55] text-warm-ivory/55">
          Add people through notes, plans,
          <br />
          and conversations.
        </p>
      </div>

      <div className="motion-card mt-6 flex justify-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-gold transition-opacity duration-300 ease-atmospheric hover:opacity-80"
        >
          Add Someone <span aria-hidden>→</span>
        </Link>
      </div>
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
                  "relative whitespace-nowrap pb-1.5 text-[11px] uppercase tracking-[0.2em] transition-opacity duration-300 ease-atmospheric " +
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

/**
 * Ghosted skeleton mirroring a populated Circle — reads as empty-not-broken.
 * The whole block sits at 40% opacity.
 */
function CircleSkeleton() {
  return (
    <ul aria-hidden className="mt-10 flex flex-col gap-5 opacity-40">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-4">
          <span
            className="h-9 w-9 shrink-0 rounded-full"
            style={{
              border: "1px solid #c9a96e",
              background: "#1a1a14",
            }}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className="block h-2.5 rounded-full"
              style={{
                width: ["52%", "44%", "60%", "40%"][i],
                background: "rgba(232,224,208,0.4)",
              }}
            />
            <span
              className="block h-1.5 rounded-full"
              style={{
                width: ["30%", "26%", "34%", "24%"][i],
                background: "rgba(155,144,128,0.4)",
              }}
            />
          </div>
          <span className="shrink-0 text-[13px]" style={{ color: "#6b6458" }}>
            —
          </span>
        </li>
      ))}
    </ul>
  );
}
