"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AppFrame,
  BottomNav,
  Checkbox,
  SectionLabel,
  Timeline,
  type TimelineItem,
} from "@/components";
import {
  Arrow,
  ArrowRight,
  Bell,
  Car,
  Chevron,
  Cloud,
  Fork,
  MapPin,
  Sparkle,
  Ticket,
  User,
} from "@/components/icons";

export default function Page() {
  return (
    <AppFrame>
      <header className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
          <h1 className="font-serif text-[44px] leading-[1.05] tracking-[-0.01em] text-warm-ivory">
            Good evening,
            <br />
            <span className="italic">J.</span>
          </h1>
          <span className="self-start pt-[10px] text-[12px] uppercase tracking-editorial text-warm-ivory/60">
            May 17, 2025
          </span>
        </div>
        <p className="max-w-[42ch] text-[15px] leading-[1.55] text-warm-ivory/65">
          Your day is set. Dinner at Sparrow tonight.
          <br />
          Leave by 7:42 PM.
        </p>
      </header>

      <div className="mt-8 h-px w-full bg-divider/70" />

      <section className="mt-6 flex flex-col">
        <SectionLabel
          trailing={
            <Link
              href="/plan/sparrow"
              className="inline-flex items-center gap-1.5 text-muted-gold"
            >
              View Map <Arrow size={12} />
            </Link>
          }
        >
          The Day
        </SectionLabel>
        <div className="mt-2">
          <Timeline items={DAY_ITEMS} />
        </div>
      </section>

      <GrabList />

      <section className="mt-8 flex flex-col">
        <SectionLabel
          trailing={
            <span className="text-[11px] tracking-editorial text-muted-gold">
              2 NEW
            </span>
          }
        >
          Signals
        </SectionLabel>
        <ul className="mt-3 flex flex-col gap-2">
          <SignalRow
            text={
              <>
                Rain clears after 7:10 PM.
                <br />
                Best arriving after sunset.
              </>
            }
            ago="8m ago"
          />
          <SignalRow
            text={
              <>
                Construction on Ashland.
                <br />
                Consider the north route.
              </>
            }
            ago="32m ago"
          />
        </ul>
      </section>

      <BottomNav active="Today" />
    </AppFrame>
  );
}

const DAY_ITEMS: TimelineItem[] = [
  { id: "work", time: "5:00 PM", title: "Work block" },
  { id: "gym", time: "6:15 PM", title: "Gym" },
  {
    id: "leave",
    time: "7:42 PM",
    title: "Leave Home",
    active: true,
    defaultExpanded: true,
    detail: <LeaveHomeDetail />,
  },
  {
    id: "sparrow",
    time: "8:30 PM",
    title: "Dinner at Sparrow",
    active: true,
    defaultExpanded: true,
    href: "/plan/sparrow",
    detail: <SparrowDetail />,
  },
  { id: "walk", time: "11:00 PM", title: "Walk Home", detail: <WalkHomeDetail /> },
];

function LeaveHomeDetail() {
  return (
    <div className="mt-1 flex flex-col gap-2 text-[13px] leading-[1.55] text-warm-ivory/70">
      <div>Best arrival window before 8:15 PM.</div>
      <div className="flex items-center gap-2 text-warm-ivory/80">
        <MapPin size={14} className="text-muted-gold/85" />
        West Loop, Chicago
      </div>
    </div>
  );
}

function WalkHomeDetail() {
  return (
    <div className="mt-1 text-[13px] leading-[1.55] text-warm-ivory/65">
      Route clears by 11:15 PM.
    </div>
  );
}

function SparrowDetail() {
  return (
    <div className="mt-1 flex flex-col gap-4">
      <div className="text-[13px] leading-[1.55] text-warm-ivory/70">
        2121 W Division St, Chicago, IL 60622
      </div>

      <div className="rounded-[10px] border border-white/[0.06] bg-soft-black/80 p-4">
        <div className="grid grid-cols-4 gap-2">
          <StatTile
            icon={<Bell size={16} className="text-muted-gold" />}
            label="Reservation"
            value="8:30 PM"
            sub="Party of 2"
          />
          <StatTile
            icon={<Car size={16} className="text-muted-gold" />}
            label="Parking"
            value="Valet"
            sub="Before 8:15"
          />
          <StatTile
            icon={<Cloud size={16} className="text-muted-gold" />}
            label="Weather"
            value="61°"
            sub="Clearing"
          />
          <StatTile
            icon={<User size={16} className="text-muted-gold" />}
            label="In the Area"
            value="Marco C."
            sub="In West Loop"
          />
        </div>

        <div className="my-4 h-px w-full bg-white/[0.06]" />

        <ul className="flex flex-col gap-3 text-[13px] leading-[1.45] text-warm-ivory/80">
          <li className="flex items-start gap-3">
            <Fork size={15} className="mt-[1px] shrink-0 text-muted-gold" />
            Ask for patio if available.
          </li>
          <li className="flex items-start gap-3">
            <Ticket size={15} className="mt-[1px] shrink-0 text-muted-gold" />
            Valet ticket in your pocket.
          </li>
          <li className="flex items-start gap-3">
            <Sparkle size={15} className="mt-[1px] shrink-0 text-muted-gold" />
            Walk home route clears by 11:15 PM.
          </li>
        </ul>

        <div className="my-4 h-px w-full bg-white/[0.06]" />

        <Link
          href="/plan/sparrow"
          className="flex items-center justify-center gap-2 py-1 text-[12px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
        >
          Open Plan <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="mb-1">{icon}</div>
      <div className="text-[9px] uppercase tracking-editorial text-warm-ivory/55">
        {label}
      </div>
      <div className="font-serif text-[16px] leading-tight text-warm-ivory">
        {value}
      </div>
      <div className="text-[10px] text-warm-ivory/55">{sub}</div>
    </div>
  );
}

function GrabList() {
  const [open, setOpen] = useState(true);
  return (
    <section className="mt-6 rounded-[10px] bg-soft-black/80">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between px-5 py-4"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3 text-[11px] uppercase tracking-editorial text-warm-ivory/65">
          Grab List
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-divider px-1.5 text-[10px] text-warm-ivory/70">
            4
          </span>
        </span>
        <span className="text-warm-ivory/60">
          <Chevron direction={open ? "up" : "down"} />
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 px-5 pb-5">
          <Checkbox checked label="ID / Wallet" />
          <Checkbox checked label="Card" />
          <Checkbox checked label="Phone" />
          <Checkbox label="Jacket" />
        </div>
      ) : null}
    </section>
  );
}

function SignalRow({
  text,
  ago,
}: {
  text: React.ReactNode;
  ago: string;
}) {
  return (
    <li className="flex items-start justify-between gap-4 border-l-2 border-muted-gold/40 bg-soft-black/70 px-4 py-3">
      <p className="text-[14px] leading-[1.5] text-warm-ivory/85">{text}</p>
      <div className="flex shrink-0 items-center gap-2 pt-[2px] text-[12px] text-warm-ivory/55">
        {ago}
        <Chevron direction="right" size={14} />
      </div>
    </li>
  );
}
