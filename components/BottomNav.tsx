"use client";

import { useState } from "react";
import { Mic } from "./icons";

const TABS = ["Today", "Radar", "Circle", "North"] as const;
type Tab = (typeof TABS)[number];

export function BottomNav({
  active: activeProp,
  onChange,
  onMic,
}: {
  active?: Tab;
  onChange?: (tab: Tab) => void;
  onMic?: () => void;
}) {
  const [internal, setInternal] = useState<Tab>("Today");
  const active = activeProp ?? internal;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-divider/70 bg-near-black/95 backdrop-blur"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 10px)" }}
    >
      <div className="flex items-center justify-between gap-3 px-6 pt-3">
        <ul className="flex flex-1 items-center justify-between pr-3">
          {TABS.map((tab) => {
            const isActive = tab === active;
            return (
              <li key={tab}>
                <button
                  type="button"
                  onClick={() => {
                    if (activeProp === undefined) setInternal(tab);
                    onChange?.(tab);
                  }}
                  className={
                    "py-2 text-[11px] uppercase tracking-editorial transition-opacity duration-300 ease-atmospheric " +
                    (isActive
                      ? "text-warm-ivory"
                      : "text-warm-ivory/40 hover:text-warm-ivory/70")
                  }
                >
                  {tab}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          aria-label="Voice"
          onClick={onMic}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-muted-gold/60 bg-near-black transition-colors duration-300 ease-atmospheric hover:border-soft-gold"
        >
          <Mic size={16} className="text-soft-gold" />
        </button>
      </div>
    </nav>
  );
}

export type { Tab };
