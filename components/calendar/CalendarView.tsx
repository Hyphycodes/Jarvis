"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { DatePickerSheet } from "@/components/plan/DatePickerSheet";

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
  const [pickerPlanId, setPickerPlanId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/plans/scheduled");
      const json = (await res.json()) as { plans?: ScheduledPlan[] };
      setPlans(json.plans ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const markedKeys = useMemo(
    () => new Set(plans.map((p) => p.scheduledDate)),
    [plans],
  );
  const todayKey = useMemo(() => localDateKey(new Date()), []);

  // When a day is picked, show that day. Otherwise show what's coming up next.
  const listed = useMemo(() => {
    if (selectedKey) return plans.filter((p) => p.scheduledDate === selectedKey);
    return plans
      .filter((p) => p.scheduledDate >= todayKey)
      .sort(
        (a, b) =>
          a.scheduledDate.localeCompare(b.scheduledDate) ||
          (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""),
      )
      .slice(0, 5);
  }, [plans, selectedKey, todayKey]);

  const cancel = useCallback(
    async (planId: string) => {
      setBusyId(planId);
      try {
        await fetch(`/api/plans/${planId}/cancel`, { method: "POST" });
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[440px] flex-col bg-[#0A0A0A] px-5 pt-[calc(env(safe-area-inset-top)+16px)]">
      <div className="flex shrink-0 items-center justify-between">
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

      {/* Scrollable body — the month grid + the day's plans. Bottom padding
          clears the fixed nav bar so the last plan is never cut off. */}
      <div className="flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+88px)]">
        <div className="mt-6">
          <MonthGrid
            selectedKey={selectedKey}
            markedKeys={markedKeys}
            onSelect={(key) => setSelectedKey(key === selectedKey ? "" : key)}
          />
        </div>

        <div className="pt-8">
          <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-warm-ivory/40">
            {selectedKey ? "On this day" : "Coming up"}
          </div>
          {listed.length > 0 ? (
            <div className="space-y-3">
              {listed.map((p) => (
                <PlanRow
                  key={p.planId}
                  plan={p}
                  showDate={!selectedKey}
                  busy={busyId === p.planId}
                  onOpen={onClose}
                  onReschedule={() => setPickerPlanId(p.planId)}
                  onCancel={() => void cancel(p.planId)}
                />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-warm-ivory/45">
              Nothing on the calendar yet. Add a plan from Radar to see it here.
            </p>
          )}
        </div>
      </div>

      {pickerPlanId ? (
        <DatePickerSheet
          planId={pickerPlanId}
          open
          onClose={() => setPickerPlanId(null)}
          onConfirmed={() => {
            setPickerPlanId(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function PlanRow({
  plan,
  showDate,
  busy,
  onOpen,
  onReschedule,
  onCancel,
}: {
  plan: ScheduledPlan;
  showDate: boolean;
  busy: boolean;
  onOpen: () => void;
  onReschedule: () => void;
  onCancel: () => void;
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
            {formatWhen(plan.scheduledDate, plan.scheduledTime, showDate)}
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
      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/plan/${plan.slug}`}
          onClick={onOpen}
          className="flex min-h-[40px] flex-1 items-center justify-center rounded-xl border border-[#D4AF53]/40 text-[11px] uppercase tracking-[0.18em] text-[#D4AF53] hover:bg-[#D4AF53]/10"
        >
          Open
        </Link>
        <button
          type="button"
          onClick={onReschedule}
          disabled={busy}
          className="flex min-h-[40px] items-center justify-center rounded-xl border border-white/[0.10] px-4 text-[11px] uppercase tracking-[0.18em] text-warm-ivory/70 hover:bg-white/[0.03] disabled:opacity-50"
        >
          Reschedule
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex min-h-[40px] items-center justify-center rounded-xl border border-white/[0.08] px-4 text-[11px] uppercase tracking-[0.18em] text-warm-ivory/40 hover:text-[#E07A6E] disabled:opacity-50"
        >
          {busy ? "…" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

function formatWhen(
  dateKey: string,
  time: string | null,
  withDate: boolean,
): string {
  const timeLabel = formatTime(time);
  if (!withDate) return timeLabel;
  const d = new Date(`${dateKey}T12:00:00`);
  const dateLabel = Number.isNaN(d.getTime())
    ? dateKey
    : d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return "";
  const meridiem = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${meridiem}`;
}

function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
