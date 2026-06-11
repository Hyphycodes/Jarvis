"use client";

import {
  Arrow,
  Bell,
  Bookmark,
  Calendar,
  Clock,
  MapPin,
  Search,
  Sparkle,
  Star,
  Ticket,
  Zap,
} from "@/components/icons";
import {
  RADAR_CATEGORY_COPY,
  type GlanceTileKey,
  type RadarFilterKey,
  type TileIconKey,
} from "@/lib/radar/categoryCopy";
import type { GlanceTile } from "@/lib/radar/categoryPagesTypes";

function TileIcon({ icon }: { icon: TileIconKey }) {
  switch (icon) {
    case "calendar":
      return <Calendar size={15} />;
    case "bookmark":
      return <Bookmark size={15} />;
    case "star":
      return <Star size={15} />;
    case "bell":
      return <Bell size={15} />;
    case "pin":
      return <MapPin size={15} />;
    case "sparkle":
      return <Sparkle size={15} />;
    case "zap":
      return <Zap size={15} />;
    case "search":
      return <Search size={15} />;
    case "clock":
      return <Clock size={15} />;
    case "arrow":
      return <Arrow size={15} />;
    case "ticket":
      return <Ticket size={15} />;
  }
}

/**
 * The four "at a glance" stat tiles. Only non-zero tiles arrive from the
 * loader; the whole row hides when none have data. Every tile is a button
 * that opens the list of items behind its count.
 */
export function AtAGlanceRow({
  filter,
  tiles,
  onTileTap,
}: {
  filter: RadarFilterKey;
  tiles: GlanceTile[];
  onTileTap: (tile: { key: GlanceTileKey; label: string }) => void;
}) {
  const copy = RADAR_CATEGORY_COPY[filter];
  if (tiles.length === 0) return null;
  return (
    <section className="mt-2">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">
        {copy.title.toUpperCase()} AT A GLANCE
      </h2>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {tiles.map((tile) => {
          const def = copy.tiles.find((t) => t.key === tile.key);
          if (!def) return null;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => onTileTap({ key: tile.key, label: def.label })}
              className="lux-surface flex flex-col items-center gap-1.5 rounded-[var(--radius-soft)] px-1 py-4 text-center transition-colors duration-300 ease-atmospheric hover:bg-white/[0.02] active:translate-y-px"
            >
              <span className="text-muted-gold/90">
                <TileIcon icon={def.icon} />
              </span>
              <span className="font-serif text-[26px] leading-none text-warm-ivory">
                {tile.count}
              </span>
              <span className="text-[8px] uppercase tracking-[0.16em] text-warm-ivory/50">
                {def.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
