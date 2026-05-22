"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import type { TodayPayload } from "@/lib/ai/types";

export function TodaySigned({ payload }: { payload?: TodayPayload }) {
  const dayItems = useMemo<TimelineItem[]>(
    () => buildTimelineItems(payload),
    [payload],
  );
  const grabItems = useMemo(
    () => payload?.grabList ?? DEFAULT_GRAB_LIST,
    [payload],
  );

  return (
    <AppFrame>
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold/85">
            {payload?.hero.eyebrow ?? "Today"}
          </span>
          <span className="text-[11px] uppercase tracking-editorial text-warm-ivory/55">
            {payload?.hero.date ?? "May 17, 2025"}
          </span>
        </div>
        <h1 className="mt-1 font-serif text-[40px] leading-[1.05] tracking-[-0.01em] text-warm-ivory">
          {payload?.hero.greeting ? (
            payload.hero.greeting
          ) : (
            <>
              Good evening,
              <br />
              <span className="italic">J.</span>
            </>
          )}
        </h1>
        <p className="mt-1 max-w-[42ch] text-[14px] leading-[1.55] text-warm-ivory/60">
          {payload?.hero.summary ?? (
            <>
              Your day is set. Dinner at Sparrow tonight.
              <br />
              Leave by 7:42 PM.
            </>
          )}
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
          <Timeline items={dayItems} />
        </div>
      </section>

      <GrabList items={grabItems} />

      {payload?.onDeck && payload.onDeck.length > 0 ? (
        <section className="mt-8 flex flex-col">
          <SectionLabel
            trailing={
              <Link
                href="/upcoming"
                className="inline-flex items-center gap-1.5 text-[11px] tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-muted-gold/80"
              >
                Upcoming{payload.upcomingCount ? ` (${payload.upcomingCount})` : ""} →
              </Link>
            }
          >
            On deck today
          </SectionLabel>
          <ul className="mt-3 flex flex-col gap-3">
            {payload.onDeck.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/item/${item.id}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.01] px-4 py-3 transition-colors duration-300 ease-atmospheric hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] text-warm-ivory">
                      {item.title}
                    </div>
                    {item.locationName ? (
                      <div className="mt-0.5 truncate text-[11px] text-warm-ivory/45">
                        {item.locationName}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-[10px] uppercase tracking-editorial text-warm-ivory/40">
                    {item.startsAt ? formatOnDeckTime(item.startsAt) : ""}
                    {item.category ? (
                      <>
                        <br />
                        {item.category}
                      </>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : payload?.upcomingCount && payload.upcomingCount > 0 ? (
        <section className="mt-8">
          <Link
            href="/upcoming"
            className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-muted-gold/80"
          >
            Upcoming ({payload.upcomingCount}) →
          </Link>
        </section>
      ) : null}

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

type GrabListEntry = { id: string; label: string; checked: boolean };

const DEFAULT_GRAB_LIST: GrabListEntry[] = [
  { id: "demo-id", label: "ID / Wallet", checked: true },
  { id: "demo-card", label: "Card", checked: true },
  { id: "demo-phone", label: "Phone", checked: true },
  { id: "demo-jacket", label: "Jacket", checked: false },
];

const DEMO_TIMELINE: TimelineItem[] = [
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

function buildTimelineItems(payload?: TodayPayload): TimelineItem[] {
  if (!payload || payload.timeline.length === 0) return DEMO_TIMELINE;

  return payload.timeline.map((item) => {
    const isSparrow = /sparrow/i.test(item.title);
    const detail = item.expandable
      ? isSparrow
        ? (<SparrowDetail />)
        : item.details
          ? (
              <div className="mt-1 text-[13px] leading-[1.55] text-warm-ivory/70">
                {item.details}
              </div>
            )
          : undefined
      : undefined;

    const base: TimelineItem = {
      id: item.id,
      time: item.time,
      title: item.title,
      defaultExpanded: isSparrow || item.id === "leave",
    };
    if (detail) base.detail = detail;
    if (item.planId || isSparrow) {
      base.href = `/plan/sparrow`;
    }
    return base;
  });
}

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

function GrabList({ items }: { items: GrabListEntry[] }) {
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
            {items.length}
          </span>
        </span>
        <span className="text-warm-ivory/60">
          <Chevron direction={open ? "up" : "down"} />
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-y-3 gap-x-6 px-5 pb-5">
          {items.map((entry) => (
            <Checkbox
              key={entry.id}
              checked={entry.checked}
              label={entry.label}
            />
          ))}
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

function formatOnDeckTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d
      .toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
      .toUpperCase();
  } catch {
    return "";
  }
}
