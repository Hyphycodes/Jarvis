"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { UseEmblaCarouselType } from "embla-carousel-react";
import { BottomNav, type Tab } from "./BottomNav";
import { MicSheet } from "./voice/MicSheet";

type EmblaApi = NonNullable<UseEmblaCarouselType[1]>;

type TabKey = "today" | "radar" | "circle" | "north";

const TABS: { key: TabKey; href: string; label: Tab }[] = [
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

/**
 * Predicate Embla calls before allowing a drag. Returns `false` if the
 * touch originated inside an element marked with `data-no-embla-drag`
 * (or one of its ancestors), so the page-level horizontal swipe doesn't
 * fight nested horizontal scrollers like Radar filter tabs or Circle's
 * filter strip.
 */
function watchDrag(_emblaApi: EmblaApi, event: TouchEvent | MouseEvent | PointerEvent) {
  const target = event.target;
  if (target instanceof Element) {
    if (target.closest("[data-no-embla-drag]")) return false;
  }
  return true;
}

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

  const [micOpen, setMicOpen] = useState(false);

  useEffect(() => {
    function openFromNativeMicEvent(event: MouseEvent | PointerEvent | TouchEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-jarvis-mic-button='true']")) {
        setMicOpen(true);
      }
    }
    document.addEventListener("click", openFromNativeMicEvent, true);
    document.addEventListener("pointerdown", openFromNativeMicEvent, true);
    document.addEventListener("touchstart", openFromNativeMicEvent, true);
    return () => {
      document.removeEventListener("click", openFromNativeMicEvent, true);
      document.removeEventListener("pointerdown", openFromNativeMicEvent, true);
      document.removeEventListener("touchstart", openFromNativeMicEvent, true);
    };
  }, []);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "start",
    containScroll: "trimSnaps",
    dragFree: false,
    duration: 22,
    watchDrag,
  });

  const lastReplacedIndex = useRef(targetIndex);

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
  }, [emblaApi, targetIndex]);

  const onNavTap = useCallback(
    (idx: number, href: string) => {
      if (!emblaApi) {
        router.replace(href);
        return;
      }
      emblaApi.scrollTo(idx, true);
      lastReplacedIndex.current = idx;
      router.replace(href);
    },
    [emblaApi, router],
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

      <BottomNav
        active={TABS[targetIndex]?.label}
        onTabSelect={onNavTap}
        onMic={() => setMicOpen(true)}
        onMicDown={() => setMicOpen(true)}
      />

      <MicSheet
        open={micOpen}
        onClose={() => setMicOpen(false)}
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
