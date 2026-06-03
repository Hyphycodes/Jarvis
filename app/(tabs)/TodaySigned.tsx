"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useMemo, useState, useTransition } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  AppFrame,
  Checkbox,
  SectionLabel,
  Timeline,
  type TimelineItem,
} from "@/components";
import { Arrow, ArrowRight, Chevron } from "@/components/icons";
import { CalendarView } from "@/components/calendar/CalendarView";
import type { TodayCommandItem, TodayPayload } from "@/lib/ai/types";

/**
 * Sprint 5 — Today realigned to OG reference.
 *
 * Renders only: hero → THE DAY (timeline) → GRAB LIST → SIGNALS.
 * OnDeck / UpcomingBridge / NextMove data still flows through the loader
 * but is intentionally not painted here — those views live at /upcoming
 * and /item/[id].
 */
export function TodaySigned({ payload }: { payload?: TodayPayload }) {
  const dayItems = useMemo<TimelineItem[]>(
    () => buildTimelineItems(payload),
    [payload],
  );
  const grabItems = payload?.grabList ?? [];
  const signals = payload?.todayStack ?? [];
  const tonightEvents = payload?.tonightEvents ?? [];
  const planSlug = payload?.livePlan?.slug;
  const [calendarOpen, setCalendarOpen] = useState(false);

  return (
    <AppFrame>
      <CalendarView open={calendarOpen} onClose={() => setCalendarOpen(false)} />
      <header className="flex flex-col pt-6">
        <div className="flex items-start justify-between gap-4">
          <span className="text-[11px] uppercase tracking-[0.16em] text-warm-ivory/55">
            {payload?.hero.eyebrow ?? "Today"}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-[0.16em] text-warm-ivory/55">
              {payload?.hero.date ?? formatToday()}
            </span>
            <button
              type="button"
              aria-label="Open calendar"
              onClick={() => setCalendarOpen(true)}
              className="inline-flex h-7 w-7 items-center justify-center text-warm-ivory/55 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory"
            >
              <CalendarIcon size={17} strokeWidth={1.5} />
            </button>
          </div>
        </div>
        <h1 className="mt-3 font-serif text-[44px] italic leading-[1.05] tracking-[-0.005em] text-warm-ivory">
          {payload?.hero.greeting ?? "Quiet day."}
        </h1>
        <p className="mt-3 max-w-[36ch] text-[15px] leading-[1.55] text-warm-ivory/64">
          {payload?.hero.summary ?? "Nothing strong enough to surface yet."}
        </p>
      </header>

      {dayItems.length > 0 ? (
        <section className="mt-12 flex flex-col">
          <div className="lux-divider mb-5 h-px w-full" />
          <SectionLabel
            trailing={
              planSlug ? (
                <Link
                  href={`/plan/${planSlug}`}
                  className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.18em] text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
                >
                  View Map <Arrow size={11} />
                </Link>
              ) : null
            }
          >
            The Day
          </SectionLabel>
          <div className="mt-4">
            <Timeline items={dayItems} />
          </div>
        </section>
      ) : null}

      <TonightSection items={tonightEvents} />

      {grabItems.length > 0 ? <GrabList items={grabItems} /> : null}

      <SignalsSection items={signals} />
    </AppFrame>
  );
}

type GrabListEntry = { id: string; label: string; checked: boolean };

// ── Timeline ────────────────────────────────────────────────────────────────

function buildTimelineItems(payload?: TodayPayload): TimelineItem[] {
  if (!payload || payload.timeline.length === 0) return [];

  return payload.timeline.map((item) => {
    const hasDetailContent = Boolean(
      item.details ||
        item.locationLine ||
        item.timingNote ||
        item.prepNote ||
        item.planSlug,
    );

    // OG-style expanded detail panel: address block, then small caps
    // labelled sections, then optional Open Plan CTA.
    const detail = hasDetailContent ? (
      <div className="flex flex-col gap-4 text-[13px] leading-[1.55] text-warm-ivory/72">
        {item.locationLine ? (
          <div className="text-[13px] leading-[1.45] text-warm-ivory/82">
            {item.locationLine}
          </div>
        ) : null}
        {item.prepNote ? (
          <DetailBlock label="What to grab">{item.prepNote}</DetailBlock>
        ) : null}
        {item.details ? (
          <DetailBlock label="Notes">{item.details}</DetailBlock>
        ) : null}
        {item.timingNote ? (
          <DetailBlock label="Timing">{item.timingNote}</DetailBlock>
        ) : null}
        {item.planSlug ? (
          <Link
            href={`/plan/${item.planSlug}`}
            className="lux-action inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.18em]"
          >
            Open plan <ArrowRight size={11} />
          </Link>
        ) : null}
      </div>
    ) : undefined;

    const base: TimelineItem = {
      id: item.id,
      time: item.time,
      title: item.title,
      active: item.status === "active",
      status: item.status,
      canPersistStatus: item.canPersistStatus,
      defaultExpanded: false,
    };
    if (detail) base.detail = detail;
    return base;
  });
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-warm-ivory/40">
        {label}
      </div>
      <div className="text-[13px] leading-[1.5] text-warm-ivory/72">
        {children}
      </div>
    </div>
  );
}

// ── Grab List ───────────────────────────────────────────────────────────────

function GrabList({ items }: { items: GrabListEntry[] }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="lux-surface mt-8 rounded-[var(--radius-card)]">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between px-5 py-4"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3 text-[11px] uppercase tracking-[0.22em] text-warm-ivory/72">
          Grab List
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-white/[0.1] px-1.5 text-[10px] text-warm-ivory/70">
            {items.length}
          </span>
        </span>
        <span className="text-warm-ivory/55">
          <Chevron direction={open ? "up" : "down"} size={14} />
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 pb-5">
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

// ── Tonight ──────────────────────────────────────────────────────────────────

function TonightSection({ items }: { items: TodayCommandItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const now = Date.now();

  // Filter out events that have already started
  const upcoming = items
    .filter((item) => {
      if (!item.startsAt) return true;
      const t = new Date(item.startsAt).getTime();
      return Number.isNaN(t) || t > now;
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  if (upcoming.length === 0) return null;

  const top = upcoming[0];
  const rest = upcoming.slice(1);

  return (
    <section className="mt-10">
      <SectionLabel
        trailing={
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-gold/70">
            Tonight
          </span>
        }
      >
        Events
      </SectionLabel>
      <div className="mt-4">
        <TonightEventCard item={top} full />
        {rest.length > 0 ? (
          expanded ? (
            <ul className="mt-3 flex flex-col gap-3">
              {rest.map((item) => (
                <li key={item.id}>
                  <TonightEventCard item={item} full={false} />
                </li>
              ))}
            </ul>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-3 w-full border-l border-muted-gold/25 py-2 pl-4 text-left text-[12px] text-warm-ivory/45 transition-colors hover:text-warm-ivory/70"
            >
              and {rest.length} more tonight →
            </button>
          )
        ) : null}
      </div>
    </section>
  );
}

function TonightEventCard({ item, full }: { item: TodayCommandItem; full: boolean }) {
  const router = useRouter();
  const [planning, setPlanning] = useState(false);
  const [, startTransition] = useTransition();
  const time = item.startsAt ? formatEventTime(item.startsAt) : null;

  function handlePlan(e: React.MouseEvent) {
    e.preventDefault();
    if (planning) return;
    setPlanning(true);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/items/${item.id}/generate-plan`, { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as { plan_slug?: string };
        if (json.plan_slug) {
          router.push(`/plan/${json.plan_slug}`);
        } else {
          window.location.href = `/item/${item.id}`;
        }
      } catch {
        setPlanning(false);
      }
    });
  }

  return (
    <div className="border-l border-muted-gold/55 bg-soft-black/40 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] leading-[1.4] text-warm-ivory/88">{item.title}</div>
          {item.subtitle ? (
            <div className="mt-0.5 text-[12px] text-warm-ivory/45">{item.subtitle}</div>
          ) : null}
          {full && item.reason ? (
            <div className="mt-1.5 line-clamp-2 text-[12px] leading-[1.5] text-warm-ivory/58">
              {item.reason}
            </div>
          ) : null}
        </div>
        {time ? (
          <div className="shrink-0 pt-0.5 text-[11px] text-muted-gold/70">{time}</div>
        ) : null}
      </div>
      {full ? (
        <div className="mt-3 flex items-center gap-3">
          {item.planSlug ? (
            <Link
              href={`/plan/${item.planSlug}`}
              className="inline-flex items-center rounded-full border border-muted-gold/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-gold transition-colors hover:bg-muted-gold/10"
            >
              View plan
            </Link>
          ) : (
            <button
              type="button"
              onClick={handlePlan}
              disabled={planning}
              className="inline-flex items-center rounded-full border border-muted-gold/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-gold transition-colors hover:bg-muted-gold/10 disabled:opacity-50"
            >
              {planning ? "…" : "Plan it"}
            </button>
          )}
          <Link
            href={`/item/${item.id}`}
            className="text-[11px] text-warm-ivory/40 hover:text-warm-ivory/70"
          >
            Details →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function formatEventTime(iso: string): string | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
}

// ── Signals ─────────────────────────────────────────────────────────────────

function SignalsSection({ items }: { items: TodayCommandItem[] }) {
  if (items.length === 0) return null;
  const top = items.slice(0, 4);
  return (
    <section className="mt-10">
      <SectionLabel
        trailing={
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-gold/70">
            {top.length} new
          </span>
        }
      >
        Signals
      </SectionLabel>
      <ul className="mt-4 flex flex-col gap-3">
        {top.map((item) => (
          <li key={item.id}>
            <SignalRow item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SignalRow({ item }: { item: TodayCommandItem }) {
  const href = item.planSlug
    ? `/plan/${item.planSlug}`
    : `/item/${item.id}`;
  const time = relativeTime(item.startsAt);
  return (
    <Link
      href={href}
      className="flex items-start gap-3 border-l border-muted-gold/35 bg-soft-black/40 px-4 py-3 transition-colors duration-300 ease-atmospheric hover:bg-soft-black/55"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-[1.4] text-warm-ivory/88">
          {item.title}
        </div>
        {item.reason ?? item.summary ?? item.subtitle ? (
          <div className="mt-1 line-clamp-1 text-[12px] leading-[1.45] text-warm-ivory/52">
            {item.reason ?? item.summary ?? item.subtitle}
          </div>
        ) : null}
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-2 pt-0.5 text-[11px] text-warm-ivory/45">
        {time ?? "now"}
        <Chevron direction="right" size={12} />
      </div>
    </Link>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    const diff = d.getTime() - Date.now();
    const absMs = Math.abs(diff);
    const minutes = Math.round(absMs / 60_000);
    const past = diff < 0;
    if (minutes < 60) return past ? `${minutes}m ago` : `in ${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`;
    const days = Math.round(hours / 24);
    return past ? `${days}d ago` : `in ${days}d`;
  } catch {
    return undefined;
  }
}

function formatToday(): string {
  return new Date()
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}
