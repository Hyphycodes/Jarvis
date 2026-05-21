"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AppFrame,
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

// TODO(intelligence): Replace the signed Today constants and hero copy with
// buildTodayPayload()/TodayPayload once the UI is wired to /api/intelligence.
export function TodaySigned() {
  return (
    <AppFrame>
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold/85">
            Today
          </span>
          <span className="text-[11px] uppercase tracking-editorial text-warm-ivory/55">
            May 17, 2025
          </span>
        </div>
        <h1 className="mt-1 font-serif text-[40px] leading-[1.05] tracking-[-0.01em] text-warm-ivory">
          Good evening,
          <br />
          <span className="italic">J.</span>
        </h1>
        <p className="mt-1 max-w-[42ch] text-[14px] leading-[1.55] text-warm-ivory/60">
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
    defaultExpanded: true,
    detail: <LeaveHomeDetail />,
  },
  {
    id: "sparrow",
    time: "8:30 PM",
    title: "Dinner at Sparrow",
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
    <div className="mt-2 flex flex-col gap-5 rounded-[8px] border border-white/[0.06] border-l-2 border-l-muted-gold/40 bg-soft-black/45 px-4 py-4">
      <div className="text-[12px] leading-[1.65] text-warm-ivory/65">
        2121 W Division St, Chicago, IL 60622
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        <StatTile
          icon={<Bell size={14} className="text-muted-gold/85" />}
          label="Reservation"
          value="8:30 PM"
          sub="Party of 2"
        />
        <StatTile
          icon={<Car size={14} className="text-muted-gold/85" />}
          label="Parking"
          value="Valet"
          sub="Before 8:15"
        />
        <StatTile
          icon={<Cloud size={14} className="text-muted-gold/85" />}
          label="Weather"
          value="61°"
          sub="Clearing"
        />
        <StatTile
          icon={<User size={14} className="text-muted-gold/85" />}
          label="In the Area"
          value="Marco C."
          sub="West Loop"
        />
      </div>

      <ul className="flex flex-col gap-3 text-[13px] leading-[1.6] text-warm-ivory/75">
        <li className="flex items-start gap-3">
          <Fork size={13} className="mt-[2px] shrink-0 text-muted-gold/80" />
          <span>Ask for patio if available.</span>
        </li>
        <li className="flex items-start gap-3">
          <Ticket size={13} className="mt-[2px] shrink-0 text-muted-gold/80" />
          <span>Valet ticket in your pocket.</span>
        </li>
        <li className="flex items-start gap-3">
          <Sparkle size={13} className="mt-[2px] shrink-0 text-muted-gold/80" />
          <span>Walk home route clears by 11:15 PM.</span>
        </li>
      </ul>

      <div
        aria-hidden
        className="inline-flex items-center gap-1.5 self-start text-[13px] text-warm-ivory/55 transition-colors duration-300 ease-atmospheric"
      >
        View full plan
        <ArrowRight size={12} />
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
    <div className="min-w-0 border-t border-white/[0.05] pt-3 first:border-t-0 first:pt-0">
      <div className="mb-2">{icon}</div>
      <div className="text-[9px] uppercase tracking-editorial text-warm-ivory/45">
        {label}
      </div>
      <div className="mt-1 font-serif text-[16px] leading-[1.15] text-warm-ivory">
        {value}
      </div>
      <div className="mt-1 text-[11px] leading-[1.35] text-warm-ivory/45">
        {sub}
      </div>
    </div>
  );
}

function GrabList() {
  // TODO(intelligence): Source grab-list rows from TodayPayload.grabList when
  // persistent plan state replaces the current static Sparrow demo surface.
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
