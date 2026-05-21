"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Chevron } from "./icons";
import { useDayPlan } from "@/lib/dayPlanStore";
import { ease } from "@/lib/motion";

export type TimelineItem = {
  id: string;
  time: string;
  title: string;
  detail?: ReactNode;
  defaultExpanded?: boolean;
  /**
   * Visual default — if true, the dot renders in the active hue (gold) until
   * the user explicitly toggles a different item active. Once an active item
   * exists in the store, that supersedes this hint.
   */
  active?: boolean;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  const initial = items.reduce<Record<string, boolean>>((acc, it) => {
    acc[it.id] = !!it.defaultExpanded;
    return acc;
  }, {});
  const [open, setOpen] = useState(initial);
  const { activeItemId, toggle } = useDayPlan();

  // If the user has explicitly chosen an active item, the dot color is driven
  // by the store. Otherwise we fall back to the data's `active` hint so the
  // initial day plan still reads correctly.
  const hasExplicitActive = items.some((it) => it.id === activeItemId);

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
        const isActive = hasExplicitActive
          ? activeItemId === item.id
          : !!item.active;

        function onTitleTap() {
          if (!hasDetail) return;
          setOpen((s) => ({ ...s, [item.id]: !s[item.id] }));
        }

        function onDotTap(e: React.MouseEvent | React.KeyboardEvent) {
          e.stopPropagation();
          toggle(item.id);
        }

        return (
          <li key={item.id} className="relative">
            <div className="grid grid-cols-[96px_24px_1fr] items-start gap-x-3 py-4">
              <div
                className={
                  "pt-[3px] text-[12px] uppercase tracking-[0.06em] " +
                  (isActive ? "text-muted-gold" : "text-warm-ivory/60")
                }
              >
                {item.time}
              </div>
              <div className="flex justify-center pt-[2px]">
                <DotToggle
                  active={isActive}
                  onTap={onDotTap}
                  itemId={item.id}
                />
              </div>
              <button
                type="button"
                onClick={onTitleTap}
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

            <AnimatePresence initial={false}>
              {isOpen && hasDetail ? (
                <motion.div
                  key={`${item.id}-detail`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="grid grid-cols-[120px_1fr] gap-x-3 pb-6">
                    <div />
                    <div>{item.detail}</div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {!isLast ? (
              <div className="ml-[120px] h-px bg-divider/70" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function DotToggle({
  active,
  onTap,
  itemId,
}: {
  active: boolean;
  onTap: (e: React.MouseEvent | React.KeyboardEvent) => void;
  itemId: string;
}) {
  // Outer button gives a 36px square hit area; inner span is the visual.
  return (
    <button
      type="button"
      aria-label={
        active ? `Deactivate ${itemId}` : `Make ${itemId} active`
      }
      aria-pressed={active}
      onClick={onTap}
      className="flex h-9 w-9 items-center justify-center"
    >
      {active ? (
        <span
          className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted-gold transition-all"
          style={{
            boxShadow: "0 0 12px rgba(184,146,74,0.4)",
            transitionDuration: "200ms",
            transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-muted-gold" />
        </span>
      ) : (
        <span
          className="relative flex h-3 w-3 items-center justify-center rounded-full border border-muted-gold/40 transition-all"
          style={{
            transitionDuration: "200ms",
            transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
          }}
        />
      )}
    </button>
  );
}
