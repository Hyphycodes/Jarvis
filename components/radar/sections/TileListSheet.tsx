"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark } from "@/components/icons";
import type { GlanceTileKey, RadarFilterKey } from "@/lib/radar/categoryCopy";
import type { ListEntry } from "@/lib/radar/categoryPagesTypes";
import { Thumb } from "./Thumb";

export type TileSheetTarget = {
  filter: RadarFilterKey;
  tile: GlanceTileKey;
  label: string;
};

/**
 * Bottom sheet listing the real items behind a tapped stat tile, scoped to
 * the category. Same visual register as the Holding sheet.
 */
export function TileListSheet({
  target,
  favoriteIds,
  onToggleFavorite,
  onClose,
}: {
  target: TileSheetTarget | null;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string, next: boolean) => void;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<ListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEntries([]);
    (async () => {
      try {
        const res = await fetch(
          `/api/radar/tile-items?filter=${encodeURIComponent(target.filter)}&tile=${encodeURIComponent(target.tile)}`,
        );
        const json = (await res.json().catch(() => ({}))) as {
          items?: ListEntry[];
          error?: string;
        };
        if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
        if (!cancelled) setEntries(json.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load items.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!target) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-0"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={target.label}
        className="max-h-[78dvh] w-full max-w-[440px] overflow-hidden rounded-t-[22px] border border-white/[0.08] bg-[#0B0B0B] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div>
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted-gold">
              {target.label}
            </h2>
            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-warm-ivory/38">
              {loading ? "Loading" : `${entries.length} item${entries.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full text-[18px] text-warm-ivory/38 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/70"
            aria-label="Close"
          >
            x
          </button>
        </div>
        <div className="max-h-[calc(78dvh-76px)] overflow-y-auto px-5 py-4">
          {error ? (
            <div className="mb-3 rounded-[var(--radius-soft)] border border-[#E07A6E]/20 bg-[#E07A6E]/5 px-3 py-2 text-[11px] text-[#E07A6E]">
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="py-10 text-center text-[12px] uppercase tracking-[0.2em] text-warm-ivory/35">
              Loading
            </div>
          ) : entries.length === 0 && !error ? (
            <div className="py-10 text-center font-serif text-[22px] italic text-warm-ivory/55">
              Nothing here yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2 pb-2">
              {entries.map((entry) => {
                const favorited = favoriteIds.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 rounded-[var(--radius-card)] border border-white/[0.05] bg-white/[0.015] p-3"
                  >
                    <Link
                      href={entry.href}
                      className="flex min-w-0 flex-1 items-center gap-3"
                      onClick={onClose}
                      aria-label={`Open ${entry.title}`}
                    >
                      <Thumb
                        src={entry.imageUrl}
                        alt={entry.title}
                        className="h-12 w-12 shrink-0 rounded-[8px]"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-serif text-[18px] leading-tight text-warm-ivory">
                          {entry.title}
                        </div>
                        {entry.subtitle ? (
                          <div className="mt-0.5 truncate text-[12px] text-warm-ivory/48">
                            {entry.subtitle}
                          </div>
                        ) : null}
                      </div>
                    </Link>
                    <button
                      type="button"
                      aria-label={favorited ? `Unfavorite ${entry.title}` : `Favorite ${entry.title}`}
                      aria-pressed={favorited}
                      onClick={() => onToggleFavorite(entry.id, !favorited)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold active:scale-95"
                    >
                      <Bookmark size={16} filled={favorited} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
