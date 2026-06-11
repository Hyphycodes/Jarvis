"use client";

import {
  Arrow,
  Calendar,
  Fork,
  Gallery,
  MapPin,
  RadarSweep,
  Sliders,
} from "@/components/icons";
import {
  RADAR_CATEGORY_COPY,
  type RadarFilterKey,
  type RadarIconKey,
} from "@/lib/radar/categoryCopy";

function HeaderIcon({ icon }: { icon: RadarIconKey }) {
  switch (icon) {
    case "radar":
      return <RadarSweep size={16} />;
    case "arrow":
      return <Arrow size={16} />;
    case "calendar":
      return <Calendar size={16} />;
    case "fork":
      return <Fork size={16} />;
    case "gallery":
      return <Gallery size={16} />;
    case "pin":
      return <MapPin size={16} />;
    case "sliders":
      return <Sliders size={16} />;
  }
}

/**
 * Per-category page header: serif italic title, date + gold-dot HELD count on
 * the right, white ethos line, gold accent line, category icon in a gold
 * circle. All copy from RADAR_CATEGORY_COPY.
 */
export function RadarCategoryHeader({
  filter,
  date,
  heldCount,
  onHeldTap,
}: {
  filter: RadarFilterKey;
  date: string;
  heldCount: number;
  onHeldTap: () => void;
}) {
  const copy = RADAR_CATEGORY_COPY[filter];
  return (
    <header className="flex flex-col gap-3 pt-6">
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
        <h1 className="font-serif text-[52px] italic leading-[1.02] tracking-[-0.005em] text-warm-ivory">
          {copy.title}
        </h1>
        <div className="self-start pt-[8px] text-right">
          <span className="block text-[11px] uppercase tracking-[0.16em] text-warm-ivory/55">
            {date}
          </span>
          <button
            type="button"
            onClick={onHeldTap}
            className="mt-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-warm-ivory/40 transition-colors duration-300 ease-atmospheric hover:text-muted-gold"
          >
            <span aria-hidden className="pulse-dot h-1 w-1 rounded-full bg-muted-gold" />
            {heldCount} held
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-x-4">
        <div>
          <p className="max-w-[38ch] text-[15px] leading-[1.55] text-warm-ivory/62">
            {copy.ethos}
          </p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-gold/85">
            {copy.accent}
          </p>
        </div>
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{
            border: "1px solid rgba(208,173,104,0.72)",
            color: "var(--gold)",
            background: "rgba(184,137,55,0.035)",
          }}
        >
          <HeaderIcon icon={copy.icon} />
        </span>
      </div>
      <div className="h-px w-8 bg-muted-gold/30" />
    </header>
  );
}
