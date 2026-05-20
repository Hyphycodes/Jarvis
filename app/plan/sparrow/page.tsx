"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AppFrame, BottomNav } from "@/components";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Car,
  Chevron,
  Clock,
  Cloud,
  Ellipsis,
  Jacket,
  MapPin,
  Moon,
  Record,
  Share,
  SignPost,
  User,
  WineGlass,
} from "@/components/icons";
import { useEventStatus } from "@/lib/eventStatus";
import { timeOfDay } from "@/lib/timeOfDay";

const SECTIONS: {
  id: string;
  label: string;
  sub: string;
  icon: ReactNode;
  href: string;
}[] = [
  {
    id: "before",
    label: "Before You Go",
    sub: "What to wear, bring, and know before you leave.",
    icon: <Jacket size={20} />,
    href: "/plan/sparrow/before-you-go",
  },
  {
    id: "move",
    label: "The Move",
    sub: "The flow of the night, step by step.",
    icon: <WineGlass size={20} />,
    href: "/plan/sparrow/the-move",
  },
  {
    id: "atmosphere",
    label: "Atmosphere",
    sub: "Energy, music, lighting, and the mood.",
    icon: <Record size={20} />,
    href: "/plan/sparrow/atmosphere",
  },
  {
    id: "details",
    label: "The Details",
    sub: "Address, reservation, contacts, and intel.",
    icon: <MapPin size={20} />,
    href: "/plan/sparrow/the-details",
  },
  {
    id: "detours",
    label: "Optional Detours",
    sub: "Places worth considering along the way.",
    icon: <SignPost size={20} />,
    href: "/plan/sparrow/optional-detours",
  },
  {
    id: "after",
    label: "After",
    sub: "How the night can end well.",
    icon: <Moon size={20} />,
    href: "/plan/sparrow/after",
  },
];

export default function SparrowPlanPage() {
  const router = useRouter();
  const { status, begin, hydrated } = useEventStatus("sparrow");
  const [dayPart, setDayPart] = useState<"Morning" | "Afternoon" | "Evening" | "Night" | "Plan">(
    "Evening",
  );

  useEffect(() => {
    setDayPart(timeOfDay());
  }, []);

  const ctaLabel =
    status === "live" ? "Live" : `Begin ${dayPart}`;

  function onBegin() {
    if (status !== "live") begin();
    router.push("/active/sparrow");
  }

  return (
    <AppFrame>
      {/* Hero */}
      <Hero
        live={status === "live"}
        hydrated={hydrated}
        ctaLabel={ctaLabel}
        onBegin={onBegin}
      />

      {/* Quick stats row */}
      <section className="mt-6 grid grid-cols-4 gap-3">
        <Stat
          icon={<Clock size={16} className="text-muted-gold" />}
          label="Leave By"
          value={<span className="font-serif text-[22px] leading-none">7:42 <span className="text-[11px] uppercase tracking-editorial text-warm-ivory/60">PM</span></span>}
        />
        <Stat
          icon={<Cloud size={16} className="text-muted-gold" />}
          label="Weather"
          value={<span className="font-serif text-[22px] leading-none">61°</span>}
          sub="Clearing"
        />
        <Stat
          icon={<Bell size={16} className="text-muted-gold" />}
          label="Parking"
          value={<span className="font-serif text-[22px] leading-none">Valet</span>}
          sub="Arrive before 8:15"
        />
        <Stat
          icon={<User size={16} className="text-muted-gold" />}
          label="In the Area"
          value={<span className="font-serif text-[22px] leading-none">Marco C.</span>}
          sub="In West Loop"
        />
      </section>

      <div className="mt-6 h-px w-full bg-white/[0.06]" />

      {/* Plan sections */}
      <section className="mt-2 flex flex-col">
        {SECTIONS.map((s, i) => (
          <SectionRow
            key={s.id}
            icon={s.icon}
            label={s.label}
            sub={s.sub}
            href={s.href}
            divider={i !== SECTIONS.length - 1}
          />
        ))}
      </section>

      {/* Quote card */}
      <aside className="mt-8 overflow-hidden border border-white/[0.06] bg-soft-black/70">
        <div className="grid grid-cols-[1fr_120px]">
          <div className="p-5">
            <span
              aria-hidden
              className="block font-serif text-[28px] leading-none text-warm-ivory/30"
            >
              “
            </span>
            <p className="mt-1 font-serif text-[16px] italic leading-[1.45] text-warm-ivory/85">
              Quiet night. Deep food. Good for long conversation and even better
              for listening.
            </p>
            <div className="mt-4 text-[12px] tracking-editorial text-warm-ivory/55">
              — J.
            </div>
          </div>
          <div
            aria-hidden
            className="min-h-[140px]"
            style={{
              backgroundImage:
                "radial-gradient(80% 100% at 60% 30%, rgba(232,228,168,0.10), transparent 60%), radial-gradient(40% 60% at 50% 80%, rgba(184,146,74,0.15), transparent 60%), linear-gradient(180deg, #141416 0%, #0a0a0b 100%)",
            }}
          />
        </div>
      </aside>

      <BottomNav active="Today" />
    </AppFrame>
  );
}

function Hero({
  live,
  hydrated,
  ctaLabel,
  onBegin,
}: {
  live: boolean;
  hydrated: boolean;
  ctaLabel: string;
  onBegin: () => void;
}) {
  return (
    <div className="relative -mx-6 -mt-[calc(env(safe-area-inset-top)+24px)] overflow-hidden">
      {/* atmospheric image placeholder */}
      <div
        aria-hidden
        className={
          "absolute inset-0 transition-opacity duration-700 ease-atmospheric " +
          (live ? "opacity-100" : "opacity-80")
        }
        style={{
          background:
            "radial-gradient(60% 70% at 60% 30%, rgba(184,146,74,0.25), transparent 60%), radial-gradient(40% 50% at 30% 80%, rgba(232,228,168,0.08), transparent 60%), linear-gradient(180deg, #1a1614 0%, #100d0c 60%, #0a0a0b 100%)",
        }}
      />
      {/* bottom fade to near-black */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-28"
        style={{
          background: "linear-gradient(180deg, transparent, #0A0A0B 95%)",
        }}
      />
      <div
        className="relative flex flex-col gap-4 px-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        {/* Top row: back left · date right */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="Back to Today"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-warm-ivory/85 backdrop-blur transition-colors duration-300 ease-atmospheric hover:border-warm-ivory/40"
          >
            <ArrowLeft size={16} />
          </Link>
          <span className="text-[12px] uppercase tracking-editorial text-warm-ivory/65">
            May 17, 2025
          </span>
        </div>
        {/* Second row: share + more icons aligned right */}
        <div className="flex items-center justify-end gap-2 -mt-2">
          <button
            type="button"
            aria-label="Share"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-warm-ivory/85 backdrop-blur"
          >
            <Share size={14} />
          </button>
          <button
            type="button"
            aria-label="More"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/35 text-warm-ivory/85 backdrop-blur"
          >
            <Ellipsis size={16} />
          </button>
        </div>

        {/* Title block — sit closer to the chrome */}
        <div className="pt-1">
          <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/70">
            Dining
          </div>
          <h1 className="mt-2 font-serif text-[60px] leading-[0.98] tracking-[-0.01em] text-warm-ivory">
            Sparrow
            <br />
            Tonight
          </h1>
          <div className="mt-4 text-[11px] uppercase tracking-editorial text-warm-ivory/70">
            West Loop, Chicago · 8:30 PM
          </div>
          <p className="mt-3 max-w-[36ch] text-[14px] leading-[1.55] text-warm-ivory/70">
            Rain clears by 7:10pm. Best arriving after sunset.
          </p>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={onBegin}
          className={
            "mb-8 mt-2 flex items-center justify-between rounded-[4px] px-6 py-4 text-[12px] uppercase tracking-editorial transition-colors duration-500 ease-atmospheric " +
            (live
              ? "bg-near-black text-muted-gold ring-1 ring-muted-gold/60"
              : "bg-warm-ivory text-near-black")
          }
          style={{ opacity: hydrated ? 1 : 0.85 }}
        >
          <span className="flex items-center gap-2">
            {live ? (
              <span
                aria-hidden
                className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-muted-gold"
              />
            ) : null}
            {ctaLabel}
          </span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div>{icon}</div>
      <div className="mt-1 text-[9px] uppercase tracking-editorial text-warm-ivory/55">
        {label}
      </div>
      <div className="text-warm-ivory">{value}</div>
      {sub ? (
        <div className="text-[10px] text-warm-ivory/55">{sub}</div>
      ) : null}
    </div>
  );
}

function SectionRow({
  icon,
  label,
  sub,
  href,
  divider,
}: {
  icon: ReactNode;
  label: string;
  sub: string;
  href: string;
  divider: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "grid grid-cols-[40px_1fr_auto] items-center gap-3 py-5 text-left transition-colors duration-300 ease-atmospheric hover:bg-soft-black/40 " +
        (divider ? "border-b border-white/[0.06]" : "")
      }
    >
      <span className="flex h-9 w-9 items-center justify-center text-warm-ivory/75">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] uppercase tracking-editorial text-warm-ivory">
          {label}
        </span>
        <span className="mt-1 block text-[13px] leading-[1.45] text-warm-ivory/55">
          {sub}
        </span>
      </span>
      <Chevron direction="right" size={14} className="text-warm-ivory/45" />
    </Link>
  );
}

