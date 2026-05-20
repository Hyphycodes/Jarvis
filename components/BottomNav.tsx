"use client";

import { useState } from "react";

const TABS = ["Today", "Radar", "Circle", "North"] as const;
type Tab = (typeof TABS)[number];

export function BottomNav({
  active: activeProp,
  onChange,
}: {
  active?: Tab;
  onChange?: (tab: Tab) => void;
}) {
  const [internal, setInternal] = useState<Tab>("Today");
  const active = activeProp ?? internal;

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[440px] justify-center"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 16px)" }}
    >
      <div className="pointer-events-auto flex w-full items-center justify-between gap-2 px-8 pt-4">
        <ul className="flex flex-1 items-center justify-between">
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
                    "text-[11px] uppercase tracking-editorial transition-opacity duration-500 ease-atmospheric " +
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
      </div>
    </nav>
  );
}

export type { Tab };
