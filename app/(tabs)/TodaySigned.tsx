"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  AppFrame,
  Checkbox,
  SectionLabel,
  Timeline,
  type TimelineItem,
} from "@/components";
import { Arrow, ArrowRight, Chevron } from "@/components/icons";
import type { TodayCommandItem, TodayPayload } from "@/lib/ai/types";

export function TodaySigned({ payload }: { payload?: TodayPayload }) {
  const dayItems = useMemo<TimelineItem[]>(
    () => buildTimelineItems(payload),
    [payload],
  );
  const grabItems = payload?.grabList ?? [];
  const onDeck = payload?.onDeck ?? [];
  const todayStack = payload?.todayStack ?? [];
  const upcoming = payload?.upcoming ?? [];

  return (
    <AppFrame>
      <header className="flex flex-col gap-4 pt-7">
        <div className="flex items-start justify-between gap-4">
          <span className="text-[11px] uppercase tracking-editorial text-muted-gold/85">
            {payload?.hero.eyebrow ?? "Today"}
          </span>
          <span className="text-[11px] uppercase tracking-editorial text-warm-ivory/55">
            {payload?.hero.date ?? formatToday()}
          </span>
        </div>
        <h1 className="mt-2 font-serif text-[52px] leading-[0.98] tracking-[-0.01em] text-warm-ivory">
          {payload?.hero.greeting ?? "Quiet day."}
        </h1>
        <p className="mt-2 max-w-[35ch] text-[16px] font-medium leading-[1.55] text-warm-ivory/72">
          {payload?.hero.summary ?? "Nothing strong enough to surface yet."}
        </p>
      </header>

      {!payload?.livePlan && dayItems.length === 0 ? (
        <NoLivePlan upcomingCount={payload?.upcomingCount ?? 0} />
      ) : null}

      {dayItems.length > 0 ? (
        <section className="mt-14 flex flex-col">
          <SectionLabel
            trailing={
              payload?.livePlan?.slug ? (
                <Link
                  href={`/plan/${payload.livePlan.slug}`}
                  className="inline-flex items-center gap-1.5 text-muted-gold"
                >
                  Plan <Arrow size={12} />
                </Link>
              ) : null
            }
          >
            The Day
          </SectionLabel>
          <div className="mt-5">
            <Timeline items={dayItems} />
          </div>
        </section>
      ) : null}

      {grabItems.length > 0 ? <GrabList items={grabItems} /> : null}

      <OnDeckSection items={onDeck} />

      <TodayStack items={todayStack} />

      <UpcomingBridge
        items={upcoming}
        count={payload?.upcomingCount ?? upcoming.length}
      />

      {payload?.nextMove ? <NextMoveSection item={payload.nextMove} /> : null}
    </AppFrame>
  );
}

type GrabListEntry = { id: string; label: string; checked: boolean };

function buildTimelineItems(payload?: TodayPayload): TimelineItem[] {
  if (!payload || payload.timeline.length === 0) return [];

  return payload.timeline
    .filter((item) => !payload.livePlan || item.planId === payload.livePlan.planId)
    .map((item, idx) => {
      const hasDetailContent = Boolean(item.details || item.locationLine || item.planSlug);
      const detail = hasDetailContent ? (
        <div className="space-y-3 text-[13px] leading-[1.55] text-warm-ivory/70">
          {item.details ? <p>{item.details}</p> : null}
          {item.locationLine ? (
            <div className="text-[11px] uppercase tracking-editorial text-warm-ivory/40">
              {item.locationLine}
            </div>
          ) : null}
          {item.timingNote ? (
            <div className="text-[12px] text-warm-ivory/52">
              {item.timingNote}
            </div>
          ) : null}
          {item.prepNote ? (
            <div className="text-[12px] text-warm-ivory/52">
              Prep: {item.prepNote}
            </div>
          ) : null}
          {item.planSlug ? (
            <Link
              href={`/plan/${item.planSlug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-muted-gold/40 bg-muted-gold/10 px-4 py-2 text-[10px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:bg-muted-gold/20"
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
        defaultExpanded: idx === 0 && Boolean(detail),
      };
      if (detail) base.detail = detail;
      return base;
    });
}

function NoLivePlan({ upcomingCount }: { upcomingCount: number }) {
  const href = upcomingCount > 0 ? "/upcoming" : "/radar";
  const label = upcomingCount > 0 ? "Open Upcoming" : "Open Radar";
  return (
    <section className="mt-10 border-y border-white/[0.06] py-4">
      <div className="text-[10px] uppercase tracking-editorial text-warm-ivory/38">
        Live
      </div>
      <h2 className="mt-2 font-serif text-[24px] leading-tight text-warm-ivory">
        No live plan
      </h2>
      <Link
        href={href}
        className="mt-4 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
      >
        {label} <ArrowRight size={12} />
      </Link>
    </section>
  );
}

function NextMoveSection({ item }: { item?: TodayCommandItem }) {
  if (!item) return null;
  return (
    <section className="mt-8">
      <SectionLabel>Next move</SectionLabel>
      <CommandItemLink item={item} prominent />
    </section>
  );
}

function OnDeckSection({ items }: { items: NonNullable<TodayPayload["onDeck"]> }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <SectionLabel>On deck</SectionLabel>
      <ul className="mt-3 flex flex-col divide-y divide-white/[0.05]">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.planId ? `/plan/${item.planId}` : `/item/${item.id}`}
              className="flex items-start justify-between gap-4 py-3 transition-colors duration-300 ease-atmospheric hover:bg-white/[0.012]"
            >
              <div className="min-w-0">
                <div className="font-serif text-[18px] leading-tight text-warm-ivory">
                  {item.title}
                </div>
                <div className="mt-1 text-[12px] text-warm-ivory/45">
                  {[formatWhen(item.startsAt), item.locationName, item.category]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <Arrow size={12} className="mt-1 shrink-0 text-muted-gold/70" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TodayStack({ items }: { items: TodayCommandItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <SectionLabel>Today stack</SectionLabel>
      <ul className="mt-3 flex flex-col divide-y divide-white/[0.05]">
        {items.map((item) => (
          <li key={item.id}>
            <CommandItemLink item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function UpcomingBridge({
  items,
  count,
}: {
  items: TodayCommandItem[];
  count: number;
}) {
  if (items.length === 0 && count === 0) return null;
  return (
    <section className="mt-10">
      <SectionLabel
        trailing={
          <Link
            href="/upcoming"
            className="inline-flex items-center gap-1.5 text-[11px] tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:text-soft-gold"
          >
            Upcoming{count ? ` (${count})` : ""} <Arrow size={12} />
          </Link>
        }
      >
        Upcoming
      </SectionLabel>
      {items.length > 0 ? (
        <ul className="mt-3 flex flex-col divide-y divide-white/[0.05]">
          {items.slice(0, 3).map((item) => (
            <li key={item.id}>
              <CommandItemLink item={item} compact />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CommandItemLink({
  item,
  compact = false,
  prominent = false,
}: {
  item: TodayCommandItem;
  compact?: boolean;
  prominent?: boolean;
}) {
  const href = item.planSlug ? `/plan/${item.planSlug}` : `/item/${item.id}`;
  const eyebrow = [
    formatWhen(item.startsAt),
    item.source ?? item.category ?? item.type,
  ].filter(Boolean);
  return (
    <Link
      href={href}
      className={
        "flex items-start justify-between gap-4 transition-colors duration-300 ease-atmospheric hover:bg-white/[0.012] " +
        (prominent
          ? "mt-3 rounded-[10px] border border-white/[0.06] bg-white/[0.012] px-4 py-4"
          : compact
            ? "py-3"
            : "py-4")
      }
    >
      <div className="min-w-0 flex-1">
        <div
          className={
            prominent
              ? "font-serif text-[22px] leading-tight text-warm-ivory"
              : "font-serif text-[18px] leading-tight text-warm-ivory"
          }
        >
          {item.title}
        </div>
        {item.reason ?? item.summary ?? item.subtitle ? (
          <div className="mt-1 line-clamp-2 text-[12px] leading-[1.45] text-warm-ivory/55">
            {item.reason ?? item.summary ?? item.subtitle}
          </div>
        ) : null}
        {item.locationName ? (
          <div className="mt-1 truncate text-[11px] text-warm-ivory/38">
            {item.locationName}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right text-[10px] uppercase leading-[1.6] tracking-editorial text-warm-ivory/38">
        {eyebrow.length > 0 ? <div>{eyebrow.join(" · ")}</div> : null}
        <div className="text-muted-gold/60">
          {item.planSlug ? "plan" : item.destination} · {item.status}
        </div>
      </div>
    </Link>
  );
}

function CompletePlanButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/plans/${planId}/complete`, {
          method: "POST",
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok || json.error) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-[10px] uppercase tracking-editorial text-warm-ivory/50 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/75 disabled:opacity-60"
      >
        {pending ? "..." : "Complete"}
      </button>
      {error ? (
        <span className="mt-1 text-[11px] text-[#E07A6E]">{error}</span>
      ) : null}
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

function formatWhen(iso?: string): string | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return undefined;
  }
}

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
