"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

/** Local YYYY-MM-DD key (avoids UTC drift from toISOString). */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function MonthGrid({
  selectedKey,
  markedKeys,
  onSelect,
  disablePast = false,
  initialMonth,
}: {
  selectedKey?: string;
  markedKeys?: Set<string>;
  onSelect: (key: string) => void;
  disablePast?: boolean;
  initialMonth?: Date;
}) {
  const today = new Date();
  const todayKey = dateKey(today);
  const [cursor, setCursor] = useState(() => {
    const base = initialMonth ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div>
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="inline-flex h-8 w-8 items-center justify-center text-warm-ivory/55 transition-colors hover:text-warm-ivory"
        >
          <ChevronLeft size={18} strokeWidth={1.5} />
        </button>
        <div className="text-[12px] uppercase tracking-[0.22em] text-warm-ivory">
          {MONTHS[month]} {year}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="inline-flex h-8 w-8 items-center justify-center text-warm-ivory/55 transition-colors hover:text-warm-ivory"
        >
          <ChevronRight size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className="text-center text-[10px] uppercase tracking-[0.14em] text-[#D4AF53]/70"
          >
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const key = dateKey(d);
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          const isMarked = markedKeys?.has(key) ?? false;
          const isPast = disablePast && key < todayKey;
          return (
            <div key={key} className="flex justify-center">
              <button
                type="button"
                disabled={isPast}
                onClick={() => onSelect(key)}
                className={cellClass({ isSelected, isToday, isPast })}
              >
                {d.getDate()}
                {isMarked && !isSelected ? (
                  <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#D4AF53]" />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cellClass({
  isSelected,
  isToday,
  isPast,
}: {
  isSelected: boolean;
  isToday: boolean;
  isPast: boolean;
}): string {
  const base =
    "relative flex h-9 w-9 items-center justify-center rounded-full text-[14px] transition-colors";
  if (isPast) return `${base} text-warm-ivory/30`;
  if (isSelected) return `${base} bg-[#D4AF53] font-medium text-[#0A0A0A]`;
  if (isToday) return `${base} text-warm-ivory ring-1 ring-[#D4AF53]/60`;
  return `${base} text-warm-ivory/85 hover:bg-white/[0.06]`;
}
