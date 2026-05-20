"use client";

import { useState, type ReactNode } from "react";
import { Chevron } from "./icons";

export type TimelineItem = {
  id: string;
  time: string;
  title: string;
  detail?: ReactNode;
  defaultExpanded?: boolean;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  const initial = items.reduce<Record<string, boolean>>((acc, it) => {
    acc[it.id] = !!it.defaultExpanded;
    return acc;
  }, {});
  const [open, setOpen] = useState(initial);

  return (
    <ol className="relative">
      <span
        aria-hidden
        className="absolute left-[112px] top-3 bottom-3 w-px bg-warm-ivory/20"
      />
      {items.map((item, i) => {
        const isOpen = open[item.id];
        const hasDetail = !!item.detail;
        const isLast = i === items.length - 1;
        return (
          <li key={item.id} className="relative">
            <div className="grid grid-cols-[96px_24px_1fr] items-start gap-x-3 py-4">
              <div className="pt-[3px] text-[12px] uppercase tracking-[0.06em] text-warm-ivory/60">
                {item.time}
              </div>
              <div className="flex justify-center pt-[6px]">
                <Node active={!!isOpen} />
              </div>
              <button
                type="button"
                onClick={() =>
                  hasDetail &&
                  setOpen((s) => ({ ...s, [item.id]: !s[item.id] }))
                }
                className="flex items-start justify-between gap-3 text-left"
                aria-expanded={isOpen}
                disabled={!hasDetail}
              >
                <span className="font-serif text-[24px] font-normal leading-[1.2] text-warm-ivory">
                  {item.title}
                </span>
                {hasDetail ? (
                  <span className="pt-[10px] text-warm-ivory/60">
                    <Chevron direction={isOpen ? "up" : "down"} />
                  </span>
                ) : null}
              </button>
            </div>

            {isOpen && hasDetail ? (
              <div className="grid grid-cols-[120px_1fr] gap-x-3 pb-6">
                <div />
                <div>{item.detail}</div>
              </div>
            ) : null}

            {!isLast ? (
              <div className="ml-[120px] h-px bg-divider/70" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Node({ active }: { active: boolean }) {
  return (
    <span
      className={
        "relative flex h-3 w-3 items-center justify-center rounded-full border " +
        (active ? "border-warm-ivory" : "border-warm-ivory/60")
      }
    >
      {active ? (
        <span className="h-1.5 w-1.5 rounded-full bg-warm-ivory" />
      ) : null}
    </span>
  );
}
