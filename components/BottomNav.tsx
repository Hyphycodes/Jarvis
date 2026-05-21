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

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-divider/40 bg-near-black/92 backdrop-blur"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
    >
      <div className="flex items-center justify-between gap-2 px-6 pt-2.5">
        <ul className="flex flex-1 items-center justify-between pr-3">
          {TABS.map((tab) => {
            const isActive = tab.label === routeActive;
            return (
              <li key={tab.label}>
                <Link
                  href={tab.href}
                  prefetch
                  className={
                    "py-1.5 text-[10px] uppercase tracking-editorial transition-opacity duration-300 ease-atmospheric " +
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
        <button
          type="button"
          aria-label="Voice"
          onClick={onMic}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-muted-gold/40 text-soft-gold transition-colors duration-300 ease-atmospheric hover:border-muted-gold/70"
        >
          <Mic size={14} />
        </button>
      </div>
    </nav>
  );
}

export type Tab = TabLabel;
