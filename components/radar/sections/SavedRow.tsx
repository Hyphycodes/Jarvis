"use client";

import Link from "next/link";
import { Bookmark } from "@/components/icons";
import type { ListEntry } from "@/lib/radar/categoryPagesTypes";
import { Thumb } from "./Thumb";

/**
 * Compact saved rows: 48px thumbnail, name, subtitle, gold bookmark on the
 * right. The bookmark toggles Favorite (filled = favorited). VIEW ALL opens
 * the full saved list for this category.
 */
export function SavedRow({
  label,
  entries,
  total,
  favoriteIds,
  onToggleFavorite,
  onViewAll,
}: {
  label: string;
  entries: ListEntry[];
  total: number;
  favoriteIds: Set<string>;
  onToggleFavorite: (id: string, next: boolean) => void;
  onViewAll: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="mt-9">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">
          {label}
        </h2>
        {total > entries.length ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[10px] uppercase tracking-[0.2em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
          >
            View all →
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {entries.map((entry) => {
          const favorited = favoriteIds.has(entry.id);
          return (
            <div
              key={entry.id}
              className="lux-surface flex items-center gap-3 rounded-[var(--radius-card)] p-3"
            >
              <Link
                href={entry.href}
                className="flex min-w-0 flex-1 items-center gap-3"
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
    </section>
  );
}
