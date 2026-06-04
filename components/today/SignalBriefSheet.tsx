"use client";

import Link from "next/link";
import { CalendarPlus, X } from "lucide-react";
import { ArrowRight } from "@/components/icons";
import type { TodayCommandItem } from "@/lib/ai/types";

export function SignalBriefSheet({
  item,
  open,
  onClose,
}: {
  item: TodayCommandItem | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !item) return null;

  const occasionLabel = formatOccasionLabel(item.occasionContext?.occasionType);
  const calendarHref = buildCalendarHref(item, occasionLabel);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/55"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[440px] rounded-t-[20px] bg-[#0a0a09] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4"
        role="dialog"
        aria-label="Signal brief"
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-gold/70">
            {occasionLabel}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center text-warm-ivory/55 hover:text-warm-ivory"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="pb-2">
          <h2 className="text-[22px] leading-[1.18] text-warm-ivory">
            {item.title}
          </h2>
          {item.occasionContext?.relationshipLine ? (
            <p className="mt-2 text-[13px] leading-[1.5] text-warm-ivory/58">
              {item.occasionContext.relationshipLine}
            </p>
          ) : null}
          {item.occasionContext?.clusterNote ? (
            <p className="mt-4 text-[14px] leading-[1.55] text-warm-ivory/72">
              {item.occasionContext.clusterNote}
            </p>
          ) : null}
          {item.reason ? (
            <p className="mt-4 text-[13px] leading-[1.55] text-warm-ivory/58">
              {item.reason}
            </p>
          ) : null}
        </div>

        <div className="lux-divider my-5 h-px w-full" />

        <div className="flex flex-col gap-3">
          {item.planSlug ? (
            <Link
              href={`/plan/${item.planSlug}`}
              onClick={onClose}
              className="flex min-h-[52px] items-center justify-between rounded-2xl border border-muted-gold/45 px-4 text-[12px] uppercase tracking-[0.2em] text-muted-gold transition-colors hover:bg-muted-gold/10"
            >
              Open Plan <ArrowRight size={12} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[52px] items-center justify-center rounded-2xl border border-muted-gold/45 px-4 text-[12px] uppercase tracking-[0.2em] text-muted-gold transition-colors hover:bg-muted-gold/10"
            >
              Build a Plan
            </button>
          )}

          <a
            href={calendarHref}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/[0.10] bg-white/[0.025] px-4 text-[12px] uppercase tracking-[0.2em] text-warm-ivory/82 transition-colors hover:bg-white/[0.045]"
          >
            <CalendarPlus size={15} strokeWidth={1.5} />
            Add to Calendar
          </a>

          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[52px] items-center justify-center rounded-2xl border border-white/[0.08] px-4 text-[12px] uppercase tracking-[0.2em] text-warm-ivory/62 transition-colors hover:bg-white/[0.035] hover:text-warm-ivory/82"
          >
            Remind me closer
          </button>
        </div>
      </div>
    </>
  );
}

function formatOccasionLabel(occasionType?: string): string {
  switch (occasionType) {
    case "birthday":
      return "Birthday";
    case "party":
      return "Party";
    case "milestone":
      return "Milestone";
    case "checkin":
      return "Check-in";
    default:
      return "Occasion";
  }
}

function buildCalendarHref(item: TodayCommandItem, occasionLabel: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${occasionLabel}: ${item.title}`,
  });
  const details = item.reason ?? item.summary ?? item.subtitle;
  if (details) params.set("details", details);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
