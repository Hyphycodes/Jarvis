"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { MonthGrid } from "@/components/calendar/MonthGrid";

type ScheduledPlan = {
  planId: string;
  slug: string;
  title: string;
  scheduledDate: string;
  scheduledTime: string | null;
  buildStatus: string;
  heroImage: string | null;
};

export function CalendarView({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [plans, setPlans] = useState<ScheduledPlan[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/plans/scheduled");
        const json = (await res.json()) as { plans?: ScheduledPlan[] };
        if (active) setPlans(json.plans ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, [open]);

  const markedKeys = useMemo(
    () => new Set(plans.map((p) => p.scheduledDate)),
    [plans],
  );
  const dayPlans = useMemo(
    () => plans.filter((p) => p.scheduledDate === selectedKey),
    [plans, selectedKey],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[440px] flex-col bg-[#0A0A0A] px-5 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.2em] text-warm-ivory/55">
          Calendar
        </span>
        <button
          type="button"
          aria-label="Close calendar"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center text-warm-ivory/55 hover:text-warm-ivory"
        >
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-6">
        <MonthGrid
          selectedKey={selectedKey}
          markedKeys={markedKeys}
          onSelect={(key) => setSelectedKey(key)}
        />
      </div>

      {dayPlans.length > 0 ? (
        <div className="mt-auto space-y-3 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6">
          {dayPlans.map((p) => (
            <PlanRow key={p.planId} plan={p} onOpen={onClose} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlanRow({
  plan,
  onOpen,
}: {
  plan: ScheduledPlan;
  onOpen: () => void;
}) {
  const ready = plan.buildStatus === "ready";
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex items-center gap-3">
        {plan.heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={plan.heroImage}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-lg bg-[#1a1a17]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-[18px] leading-tight text-warm-ivory">
            {plan.title}
          </div>
          <div className="mt-0.5 text-[12px] text-warm-ivory/55">
            {formatTime(plan.scheduledTime)}
          </div>
        </div>
        <span
          className={
            "shrink-0 text-[10px] uppercase tracking-[0.16em] " +
            (ready ? "text-[#D4AF53]" : "text-warm-ivory/40")
          }
        >
          {ready ? "Ready" : "Building…"}
        </span>
      </div>
      <Link
        href={`/plan/${plan.slug}`}
        onClick={onOpen}
        className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-[#D4AF53]/40 text-[11px] uppercase tracking-[0.2em] text-[#D4AF53] hover:bg-[#D4AF53]/10"
      >
        Open Plan →
      </Link>
    </div>
  );
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return "";
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${meridiem}`;
}
