"use client";

import Link from "next/link";
import type { ConfirmedEntry } from "@/lib/radar/categoryPagesTypes";
import { Thumb } from "./Thumb";

function formatConfirmedWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} • ${time}`;
}

/**
 * Confirmed commitments — dining reservations / confirmed events. Full-width
 * cards: image left, gold date/time, serif name, detail line, CONFIRMED badge.
 */
export function ConfirmedSection({
  label,
  entries,
}: {
  label: string;
  entries: ConfirmedEntry[];
}) {
  if (entries.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/45">
        {label}
      </h2>
      <div className="mt-3 flex flex-col gap-3">
        {entries.map((entry) => (
          <Link
            key={entry.id}
            href={entry.href}
            className="lux-surface block overflow-hidden rounded-[var(--radius-card)] transition-colors duration-300 ease-atmospheric hover:bg-white/[0.012]"
            aria-label={`Open ${entry.title}`}
          >
            <div className="grid grid-cols-[110px_1fr]">
              <Thumb src={entry.imageUrl} alt={entry.title} className="h-full min-h-[112px]" />
              <div className="flex flex-col p-4">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-gold">
                  {entry.whenIso ? formatConfirmedWhen(entry.whenIso) : "Planned"}
                </div>
                <h3 className="mt-1.5 font-serif text-[22px] leading-[1.1] text-warm-ivory">
                  {entry.title}
                </h3>
                {entry.detailLine ? (
                  <p className="mt-1 text-[12px] leading-[1.4] text-warm-ivory/55">
                    {entry.detailLine}
                  </p>
                ) : null}
                <div className="mt-auto flex items-center justify-end pt-2">
                  <span className="text-[9px] uppercase tracking-[0.22em] text-muted-gold">
                    Confirmed
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
