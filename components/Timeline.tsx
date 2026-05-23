"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Chevron } from "./icons";
import { useDayPlan } from "@/lib/dayPlanStore";
import { ease } from "@/lib/motion";

export type TimelineItem = {
  id: string;
  time: string;
  title: string;
  detail?: ReactNode;
  href?: string;
  status?: "pending" | "active" | "done" | "skipped";
  canPersistStatus?: boolean;
  defaultExpanded?: boolean;
  /**
   * Visual default — if true, the dot renders in the active hue (gold) until
   * the user explicitly toggles a different item active. Once an active item
   * exists in the store, that supersedes this hint.
   */
  active?: boolean;
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  const router = useRouter();
  const initial = items.reduce<Record<string, boolean>>((acc, it) => {
    acc[it.id] = !!it.defaultExpanded;
    return acc;
  }, {});
  const [open, setOpen] = useState(initial);
  const [statusById, setStatusById] = useState<Record<string, TimelineItem["status"]>>(
    () =>
      items.reduce<Record<string, TimelineItem["status"]>>((acc, it) => {
        acc[it.id] = it.status;
        return acc;
      }, {}),
  );
  const { activeItemId, toggle } = useDayPlan();

  // If the user has explicitly chosen an active item, the dot color is driven
  // by the store. Otherwise we fall back to the data's `active` hint so the
  // initial day plan still reads correctly.
  const hasExplicitActive = items.some((it) => it.id === activeItemId);

  return (
    <ol className="relative">
      <span
        aria-hidden
        className="absolute left-[142px] top-4 bottom-4 w-px"
        style={{ background: "rgba(246,239,221,0.13)" }}
      />
      {items.map((item, i) => {
        const isOpen = open[item.id];
        const hasDetail = !!item.detail;
        const isLast = i === items.length - 1;
        const isActive = hasExplicitActive
          ? activeItemId === item.id
          : !!item.active;
        const currentStatus = statusById[item.id] ?? item.status;
        const isDone = currentStatus === "done";

        function onTitleTap() {
          if (!hasDetail) return;
          setOpen((s) => ({ ...s, [item.id]: !s[item.id] }));
        }

        function onDotTap(e: React.MouseEvent | React.KeyboardEvent) {
          e.stopPropagation();
          const previous = statusById[item.id] ?? item.status ?? "pending";
          const next = previous === "done" ? "pending" : "done";
          setStatusById((s) => ({ ...s, [item.id]: next }));
          toggle(item.id);
          if (item.canPersistStatus === false) return;
          fetch(`/api/timeline/${item.id}/toggle`, { method: "POST" })
            .then(async (res) => {
              const json = (await res.json().catch(() => ({}))) as {
                status?: "pending" | "done";
                error?: string;
              };
              if (!res.ok || json.error || !json.status) {
                throw new Error(json.error ?? `HTTP ${res.status}`);
              }
              setStatusById((s) => ({ ...s, [item.id]: json.status }));
            })
            .catch(() => {
              setStatusById((s) => ({ ...s, [item.id]: previous }));
            });
        }

        function onDetailTap() {
          if (item.href) router.push(item.href);
        }

        function onDetailKeyDown(e: React.KeyboardEvent) {
          if (!item.href) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(item.href);
          }
        }

        return (
          <li key={item.id} className="relative">
            <div className="grid grid-cols-[118px_36px_1fr] items-start gap-x-4 py-7">
              <div
                className={
                  "pt-[8px] text-[13px] uppercase tracking-[0.06em] " +
                  (isActive || isDone ? "text-muted-gold" : "text-warm-ivory/60")
                }
              >
                {item.time}
              </div>
              <div className="flex justify-center pt-[7px]">
                <DotToggle
                  active={isActive}
                  done={isDone}
                  onTap={onDotTap}
                  itemId={item.id}
                />
              </div>
              <button
                type="button"
                onClick={onTitleTap}
                className="flex min-w-0 items-start justify-between gap-4 text-left"
                aria-expanded={isOpen}
                disabled={!hasDetail}
              >
                <span
                  className={
                    "font-serif text-[31px] font-normal leading-[1.08] text-warm-ivory " +
                    (isDone ? "text-warm-ivory/45 line-through decoration-warm-ivory/25" : "")
                  }
                >
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
                  <div className="grid grid-cols-[158px_1fr] gap-x-4 pb-8">
                    <div />
                    <div
                      role={item.href ? "link" : undefined}
                      tabIndex={item.href ? 0 : undefined}
                      onClick={onDetailTap}
                      onKeyDown={onDetailKeyDown}
                      className={
                        "border-l px-5 py-4 text-warm-ivory/72 " +
                        (item.href
                          ? "cursor-pointer transition duration-300 ease-atmospheric hover:translate-y-[-1px] active:translate-y-px"
                          : "")
                      }
                      style={{
                        borderColor: "rgba(208,173,104,0.32)",
                        background:
                          "linear-gradient(90deg, rgba(184,137,55,0.04), transparent 74%)",
                      }}
                    >
                      {item.detail}
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {!isLast ? (
              <div
                className="ml-[158px] h-px"
                style={{ background: "rgba(246,239,221,0.065)" }}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function DotToggle({
  active,
  done,
  onTap,
  itemId,
}: {
  active: boolean;
  done: boolean;
  onTap: (e: React.MouseEvent | React.KeyboardEvent) => void;
  itemId: string;
}) {
  // Outer button gives a 36px square hit area; inner span is the visual.
  return (
    <button
      type="button"
      aria-label={
        done ? `Mark ${itemId} incomplete` : `Mark ${itemId} complete`
      }
      title={done ? "Mark incomplete" : "Mark complete"}
      aria-pressed={done}
      onClick={onTap}
      className="flex h-9 w-9 items-center justify-center transition duration-200 ease-atmospheric active:scale-90"
    >
      {active || done ? (
        <span
          className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full border border-muted-gold transition-all"
          style={{
            boxShadow: "0 0 12px rgba(184,137,55,0.34)",
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
