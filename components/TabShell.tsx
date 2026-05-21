"use client";

import { motion, useMotionValue } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { UseEmblaCarouselType } from "embla-carousel-react";
import { Mic } from "./icons";

type EmblaApi = NonNullable<UseEmblaCarouselType[1]>;

type TabKey = "today" | "radar" | "circle" | "north";

const TABS: { key: TabKey; href: string; label: string }[] = [
  { key: "today", href: "/", label: "Today" },
  { key: "radar", href: "/radar", label: "Radar" },
  { key: "circle", href: "/circle", label: "Circle" },
  { key: "north", href: "/north", label: "North" },
];

function indexFromPath(pathname: string | null): number {
  if (!pathname) return 0;
  if (pathname === "/") return 0;
  if (pathname.startsWith("/radar")) return 1;
  if (pathname.startsWith("/circle")) return 2;
  if (pathname.startsWith("/north")) return 3;
  return 0;
}

// Indicator left position in % of nav track. Last tab sits at 75%.
const MAX_PCT = ((TABS.length - 1) / TABS.length) * 100;

export function TabShell({
  today,
  radar,
  circle,
  north,
}: {
  today: ReactNode;
  radar: ReactNode;
  circle: ReactNode;
  north: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const targetIndex = indexFromPath(pathname);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "start",
    containScroll: "trimSnaps",
    dragFree: false,
    duration: 22,
  });

  // Indicator `left` driven directly from Embla scroll. No spring — the
  // finger is the transition.
  const indicatorLeft = useMotionValue(`${targetIndex * (MAX_PCT / (TABS.length - 1))}%`);
  const lastReplacedIndex = useRef(targetIndex);

  useEffect(() => {
    if (!emblaApi) return;
    function onScroll(api: EmblaApi) {
      const progress = Math.max(0, Math.min(1, api.scrollProgress()));
      indicatorLeft.set(`${progress * MAX_PCT}%`);
    }
    onScroll(emblaApi);
    emblaApi.on("scroll", onScroll);
    emblaApi.on("reInit", onScroll);
    return () => {
      emblaApi.off("scroll", onScroll);
      emblaApi.off("reInit", onScroll);
    };
  }, [emblaApi, indicatorLeft]);

  // After a settle, sync URL via replace (so history isn't polluted).
  useEffect(() => {
    if (!emblaApi) return;
    function onSettle(api: EmblaApi) {
      const idx = api.selectedScrollSnap();
      if (idx === lastReplacedIndex.current) return;
      lastReplacedIndex.current = idx;
      const next = TABS[idx]?.href;
      if (next) router.replace(next);
    }
    emblaApi.on("settle", onSettle);
    return () => {
      emblaApi.off("settle", onSettle);
    };
  }, [emblaApi, router]);

  // Sync carousel when URL changes externally (deep link / nav tap).
  useEffect(() => {
    if (!emblaApi) return;
    if (emblaApi.selectedScrollSnap() === targetIndex) return;
    emblaApi.scrollTo(targetIndex, true);
    lastReplacedIndex.current = targetIndex;
    indicatorLeft.set(
      `${targetIndex * (MAX_PCT / (TABS.length - 1))}%`,
    );
  }, [emblaApi, targetIndex, indicatorLeft]);

  const onNavTap = useCallback(
    (idx: number) => {
      if (!emblaApi) {
        router.replace(TABS[idx].href);
        return;
      }
      emblaApi.scrollTo(idx, true);
      lastReplacedIndex.current = idx;
      indicatorLeft.set(`${idx * (MAX_PCT / (TABS.length - 1))}%`);
      router.replace(TABS[idx].href);
    },
    [emblaApi, router, indicatorLeft],
  );

  return (
    <div className="relative mx-auto w-full max-w-[440px] bg-near-black text-warm-ivory">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          <TabPanel>{today}</TabPanel>
          <TabPanel>{radar}</TabPanel>
          <TabPanel>{circle}</TabPanel>
          <TabPanel>{north}</TabPanel>
        </div>
      </div>

      <CarouselBottomNav
        activeIndex={targetIndex}
        indicatorLeft={indicatorLeft}
        onNavTap={onNavTap}
      />
    </div>
  );
}

function TabPanel({ children }: { children: ReactNode }) {
  // Full-viewport vertically scrollable slide. Embla's horizontal drag
  // doesn't block native vertical scroll inside the panel.
  return (
    <div
      className="min-w-0 flex-[0_0_100%] overflow-y-auto"
      style={{ height: "100dvh" }}
    >
      {children}
    </div>
  );
}

function CarouselBottomNav({
  activeIndex,
  indicatorLeft,
  onNavTap,
}: {
  activeIndex: number;
  indicatorLeft: ReturnType<typeof useMotionValue<string>>;
  onNavTap: (idx: number) => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-divider/40 bg-near-black/92 backdrop-blur"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6px)" }}
    >
      <div className="flex items-center justify-between gap-2 px-6 pt-2.5">
        <div className="relative flex-1 pr-3">
          <motion.span
            aria-hidden
            className="absolute top-0 h-px w-8 bg-muted-gold/70"
            style={{ left: indicatorLeft }}
          />
          <ul className="grid grid-cols-4 items-center">
            {TABS.map((tab, i) => {
              const isActive = i === activeIndex;
              return (
                <li key={tab.key} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onNavTap(i)}
                    className={
                      "inline-flex min-h-9 items-center py-1.5 text-[10px] uppercase tracking-editorial transition duration-300 ease-atmospheric active:translate-y-px " +
                      (isActive
                        ? "text-warm-ivory"
                        : "text-warm-ivory/40 hover:text-warm-ivory/70")
                    }
                  >
                    {tab.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <button
          type="button"
          aria-label="Voice"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-muted-gold/40 text-soft-gold transition duration-300 ease-atmospheric hover:border-muted-gold/70 active:scale-95"
        >
          <Mic size={14} />
        </button>
      </div>
    </nav>
  );
}
