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

/**
 * Global bottom nav — single source of truth across Today, Radar, Circle,
 * North, and any other page that imports it.
 *
 * Spec:
 *   - Flush to the very bottom (no float, no lift, no shadow, no blur)
 *   - Solid var(--bg) background, 60px above the iOS safe-area inset
 *   - Active tab marked by a 4×4 gold dot CENTERED below the label baseline
 *   - Inactive tabs: var(--text-muted); active label: var(--gold)
 *   - Right side: 40px circular border-1.5px var(--gold) mic button
 *
 * Pages that render this directly should include
 *   padding-bottom: calc(60px + env(safe-area-inset-bottom))
 * on their main scroll container. Pages wrapped by <TabShell> get this
 * automatically (TabShell renders this component as a fixed overlay).
 */
export function BottomNav({
  active,
  onMic,
  onTabSelect,
}: {
  active?: TabLabel;
  onMic?: () => void;
  /** Optional intercept (used by TabShell to scroll Embla in place). */
  onTabSelect?: (index: number, href: string) => void;
}) {
  const pathname = usePathname() ?? "/";
  const routeActive: TabLabel =
    active ??
    (TABS.find((t) =>
      t.href === "/" ? pathname === "/" : pathname.startsWith(t.href),
    )?.label ??
      "Today");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px]"
      style={{
        background:
          "linear-gradient(180deg, rgba(6,6,5,0.92) 0%, var(--bg) 38%)",
        borderTop: "1px solid rgba(246,239,221,0.11)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 px-6"
        style={{ height: "58px" }}
      >
        <ul className="grid flex-1 grid-cols-4 items-center">
          {TABS.map((tab, idx) => {
            const isActive = tab.label === routeActive;
            const labelClass =
              "uppercase tracking-[0.16em] text-[10px] transition-colors duration-300 ease-atmospheric";
            const content = (
              <span className="relative inline-flex flex-col items-center">
                <span
                  className={labelClass}
                  style={
                    isActive
                      ? { color: "var(--text-primary)" }
                      : { color: "var(--text-muted)" }
                  }
                >
                  {tab.label}
                </span>
                <span
                  aria-hidden
                  className="mt-1 h-1 w-1 rounded-full"
                  style={{
                    background: isActive
                      ? "var(--text-primary)"
                      : "transparent",
                  }}
                />
              </span>
            );

            return (
              <li
                key={tab.label}
                className="flex items-center justify-center"
              >
                {onTabSelect ? (
                  <button
                    type="button"
                    onClick={() => onTabSelect(idx, tab.href)}
                    className="inline-flex h-full min-h-10 items-center justify-center px-3 active:translate-y-px"
                  >
                    {content}
                  </button>
                ) : (
                  <Link
                    href={tab.href}
                    prefetch
                    className="inline-flex h-full min-h-10 items-center justify-center px-3 active:translate-y-px"
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          aria-label="Voice"
          onClick={onMic}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ease-atmospheric active:scale-95"
          style={{
            border: "1px solid rgba(208,173,104,0.72)",
            color: "var(--gold)",
            background: "rgba(184,137,55,0.035)",
          }}
        >
          <Mic size={15} />
        </button>
      </div>
    </nav>
  );
}

export type Tab = TabLabel;
