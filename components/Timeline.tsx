"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Chevron } from "./icons";

export type TimelineItem = {
  id: string;
  time: string;
  title: string;
  detail?: ReactNode;
  defaultExpanded?: boolean;
  /** Active = gold time + gold node. Used for the "now" / "next" events. */
  active?: boolean;
  /** Optional route to open when the row is tapped. */
  href?: string;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  const router = useRouter();
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

        function onRowTap() {
          if (item.href) router.push(item.href);
          else if (hasDetail) setOpen((s) => ({ ...s, [item.id]: !s[item.id] }));
        }

        return (
          <li key={item.id} className="relative">
            <div className="grid grid-cols-[96px_24px_1fr] items-start gap-x-3 py-4">
              <div
                className={
                  "pt-[3px] text-[12px] uppercase tracking-[0.06em] " +
                  (item.active
                    ? "text-muted-gold"
                    : "text-warm-ivory/60")
                }
              >
                {item.time}
              </div>
              <div className="flex justify-center pt-[6px]">
                <Node active={!!item.active} expanded={!!isOpen} />
              </div>
              <button
                type="button"
                onClick={onRowTap}
                className="flex items-start justify-between gap-3 text-left"
                aria-expanded={isOpen}
                disabled={!hasDetail && !item.href}
              >
                <span className="font-serif text-[24px] font-normal leading-[1.2] text-warm-ivory">
                  {item.title}
                </span>
                {hasDetail || item.href ? (
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

function Node({ active, expanded }: { active: boolean; expanded: boolean }) {
  if (active) {
    return (
      <span
        className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted-gold"
        style={{ boxShadow: "0 0 10px rgba(184,146,74,0.4)" }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-muted-gold" />
      </span>
    );
  }
  return (
    <span
      className={
        "relative flex h-3 w-3 items-center justify-center rounded-full border " +
        (expanded ? "border-warm-ivory" : "border-warm-ivory/60")
      }
    >
      {expanded ? <span className="h-1.5 w-1.5 rounded-full bg-warm-ivory" /> : null}
    </span>
  );
}
