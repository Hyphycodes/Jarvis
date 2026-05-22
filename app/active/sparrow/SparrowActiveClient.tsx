"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppFrame, BackButton, MotionPage } from "@/components";
import {
  Bell,
  Car,
  Chevron,
  MapPin,
  Mic,
  Receipt,
  Sparkle,
} from "@/components/icons";
import { useEventStatus } from "@/lib/eventStatus";
import { useDayPlan } from "@/lib/dayPlanStore";

export function SparrowActiveClient({
  planId,
  dateLabel,
}: {
  planId: string | null;
  dateLabel: string;
}) {
  const { status, begin } = useEventStatus("sparrow", {
    planId: planId ?? undefined,
  });
  const { activeItemId, setActive } = useDayPlan();

  useEffect(() => {
    if (status !== "live") begin();
    if (activeItemId !== "sparrow") setActive("sparrow");
  }, [status, begin, activeItemId, setActive]);

  return (
    <AppFrame>
      <MotionPage>
      <div className="flex items-center justify-between">
        <BackButton fallbackHref="/plan/sparrow" />
        <div className="flex items-center gap-2 text-[13px] italic text-muted-gold">
          <span
            aria-hidden
            className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-muted-gold"
          />
          <span className="font-serif">Tonight</span>
        </div>
        <span className="text-[12px] uppercase tracking-editorial text-warm-ivory/65">
          {dateLabel}
        </span>
      </div>

      <header className="mt-6 flex flex-col gap-3">
        <h1 className="font-serif text-[46px] italic leading-[1.02] tracking-[-0.01em] text-warm-ivory">
          You’re at Sparrow.
        </h1>
        <p className="max-w-[40ch] font-serif text-[16px] italic leading-[1.45] text-warm-ivory/75">
          Take the time. Order slowly. Marco is two blocks away if the night
          opens up.
        </p>
        <div className="mt-2 h-px w-full bg-white/[0.06]" />
      </header>

      <section className="mt-6 rounded-[10px] border border-muted-gold/25 bg-soft-black/70 p-5">
        <div className="text-[10px] uppercase tracking-editorial text-muted-gold">
          Current Moment
        </div>
        <h2 className="mt-2 font-serif text-[30px] italic leading-[1.05] text-warm-ivory">
          Waiting for the table.
        </h2>
        <p className="mt-2 text-[14px] leading-[1.45] text-warm-ivory/70">
          Should be just a few more minutes.
        </p>

        <div className="my-5 h-px w-full bg-white/[0.06]" />

        <div className="grid grid-cols-2 gap-x-5 gap-y-5">
          <div className="flex items-start gap-3">
            <MapPin size={16} className="mt-1 shrink-0 text-muted-gold" />
            <div>
              <div className="font-serif text-[17px] leading-tight text-warm-ivory">
                Sparrow
              </div>
              <div className="mt-1 text-[13px] leading-[1.45] text-warm-ivory/65">
                2121 W Division St.
                <br />
                Chicago, IL 60622
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5 border-l border-white/[0.06] pl-5">
            <Mini
              icon={<Bell size={14} className="text-muted-gold" />}
              label="Reservation"
              value="8:30 PM · Party of 2"
            />
            <Mini
              icon={<Car size={14} className="text-muted-gold" />}
              label="Valet"
              value={
                <>
                  Garage entrance on
                  <br />
                  W. Division
                </>
              }
            />
            <Mini
              icon={<Receipt size={14} className="text-muted-gold" />}
              label="Note"
              value={
                <>
                  They finish dishes with
                  <br />
                  lemon olive oil—ask for extra.
                </>
              }
            />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 text-[13px] leading-[1.45] text-warm-ivory/70">
          <div>Ask for patio if available.</div>
          <div>Valet ticket in your pocket.</div>
          <div>Walk home route clears by 11:15.</div>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold">
            What’s Next
          </span>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-editorial text-warm-ivory/70 hover:text-warm-ivory"
          >
            See Full Night <Chevron direction="right" size={12} />
          </button>
        </div>

        <NextRail
          steps={[
            { label: "Seated", sub: "Now", active: true },
            { label: "Aperitif", sub: "Next" },
            { label: "First course", sub: "Around 9:00" },
            { label: "After dinner", sub: "11:00+" },
          ]}
        />
      </section>

      <aside className="mt-8 flex items-start gap-4 rounded-[10px] border border-white/[0.06] bg-soft-black/70 p-4">
        <Sparkle size={18} className="mt-1 shrink-0 text-muted-gold" />
        <div className="border-l border-muted-gold/30 pl-4">
          <p className="text-[14px] leading-[1.5] text-warm-ivory/85">
            Valet closes at 11:30.
          </p>
          <p className="mt-1 text-[13px] leading-[1.5] text-warm-ivory/55">
            Plan your exit when the check arrives.
          </p>
        </div>
      </aside>

      <div className="mt-10 flex items-center justify-center gap-6">
        <div className="text-right font-serif text-[15px] italic leading-[1.3] text-warm-ivory/75">
          Need anything?
          <br />
          I’m listening.
        </div>
        <ListeningHalo />
      </div>

      <ActiveDock />
      </MotionPage>
    </AppFrame>
  );
}

function Mini({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-editorial text-muted-gold">
        {icon}
        {label}
      </div>
      <div className="text-[13px] leading-[1.45] text-warm-ivory/85">
        {value}
      </div>
    </div>
  );
}

function NextRail({
  steps,
}: {
  steps: { label: string; sub: string; active?: boolean }[];
}) {
  return (
    <div className="relative mt-5">
      <div
        aria-hidden
        className="absolute left-3 right-3 top-3 h-px bg-warm-ivory/15"
      />
      <ul className="relative grid grid-cols-4 gap-2">
        {steps.map((s) => (
          <li key={s.label} className="flex flex-col items-center text-center">
            <span
              className={
                "flex h-6 w-6 items-center justify-center rounded-full border " +
                (s.active
                  ? "border-muted-gold"
                  : "border-warm-ivory/30 bg-near-black")
              }
              style={
                s.active
                  ? { boxShadow: "0 0 14px rgba(184,146,74,0.45)" }
                  : undefined
              }
            >
              {s.active ? (
                <span className="h-2 w-2 rounded-full bg-muted-gold" />
              ) : null}
            </span>
            <div
              className={
                "mt-3 font-serif text-[15px] leading-tight " +
                (s.active ? "text-warm-ivory" : "text-warm-ivory/75")
              }
            >
              {s.label}
            </div>
            <div
              className={
                "mt-1 text-[11px] " +
                (s.active ? "text-muted-gold" : "text-warm-ivory/45")
              }
            >
              {s.sub}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ListeningHalo() {
  return (
    <button
      type="button"
      aria-label="Speak to Jarvis"
      className="relative flex h-[88px] w-[88px] items-center justify-center"
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full border border-muted-gold/70"
        style={{ boxShadow: "0 0 22px rgba(184,146,74,0.35)" }}
      />
      <span
        aria-hidden
        className="pulse-dot absolute inset-[10px] rounded-full border border-muted-gold/40"
      />
      <Mic size={28} className="text-soft-gold" />
    </button>
  );
}

function ActiveDock() {
  const router = useRouter();

  function exit() {
    router.push("/plan/sparrow");
  }

  return (
    <nav
      aria-label="Active mode dock"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-divider/70 bg-near-black/95 backdrop-blur"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-6 pt-3">
        <ul className="flex items-center justify-between">
          {(["Today", "Radar", "Circle", "North"] as const).map((tab) => (
            <li key={tab}>
              <Link
                href={tab === "Today" ? "/" : `/${tab.toLowerCase()}`}
                className={
                  "py-2 text-[11px] uppercase tracking-editorial " +
                  (tab === "Today"
                    ? "text-warm-ivory"
                    : "text-warm-ivory/40 hover:text-warm-ivory/70")
                }
              >
                {tab}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={exit}
            aria-label="Exit Active Mode"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-muted-gold/60 text-soft-gold transition-colors duration-300 ease-atmospheric hover:border-soft-gold"
          >
            <Chevron direction="up" size={16} />
          </button>
          <span className="max-w-[80px] text-center text-[9px] leading-tight text-warm-ivory/55">
            Swipe up to exit Active Mode
          </span>
        </div>
      </div>
    </nav>
  );
}
