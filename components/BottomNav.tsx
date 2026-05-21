"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic } from "./icons";

const TABS = [
  { label: "Today", href: "/" },
  { label: "Radar", href: "/radar" },
  { label: "Circle", href: "/circle" },
  { label: "North", href: "/north" },
] as const;

type TabLabel = (typeof TABS)[number]["label"];

export function BottomNav({
  active,
  onMic,
}: {
  active?: TabLabel;
  onMic?: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const routeActive =
    active ??
    (TABS.find((t) =>
      t.href === "/" ? pathname === "/" : pathname.startsWith(t.href),
    )?.label ??
      "Today");
  const activeIndex = TABS.findIndex((tab) => tab.label === routeActive);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-divider/40 bg-near-black/92 backdrop-blur"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
    >
      <div className="flex items-center justify-between gap-2 px-6 pt-2.5">
        <div className="relative flex-1 pr-3">
          <span
            aria-hidden
            className="absolute top-0 h-px w-8 bg-muted-gold/70 transition-[left] duration-300 ease-atmospheric"
            style={{
              left: `${Math.max(activeIndex, 0) * 25}%`,
            }}
          />
          <ul className="grid grid-cols-4 items-center">
          {TABS.map((tab) => {
            const isActive = tab.label === routeActive;
            return (
              <li key={tab.label} className="min-w-0">
                <Link
                  href={tab.href}
                  prefetch
                  className={
                    "inline-flex min-h-9 items-center py-1.5 text-[10px] uppercase tracking-editorial transition duration-300 ease-atmospheric active:translate-y-px " +
                    (isActive
                      ? "text-warm-ivory"
                      : "text-warm-ivory/40 hover:text-warm-ivory/70")
                  }
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
          </ul>
        </div>
        <button
          type="button"
          aria-label="Voice"
          onClick={onMic}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-muted-gold/40 text-soft-gold transition duration-300 ease-atmospheric hover:border-muted-gold/70 active:scale-95"
        >
          <Mic size={14} />
        </button>
      </div>
    </nav>
  );
}

export type Tab = TabLabel;
