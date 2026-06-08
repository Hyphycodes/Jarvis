"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "./icons";
import { DatePickerSheet } from "./DatePickerSheet";
import type { PlanState } from "@/lib/plans/planBrief";

/**
 * PlanPrimaryButton — ivory rectangle CTA used in the hero and on the
 * Move page. Routes its action through the existing plan API:
 *   ready    → POST /api/plans/[id]/activate   (label: BEGIN EVENING)
 *   live     → POST /api/plans/[id]/complete   (label: MARK COMPLETE)
 *              + secondary "Cancel" link
 *   after    → disabled visual                  (label: COMPLETED)
 *   holding  → disabled visual                  (label: BEGIN EVENING)
 *
 * When `planId` is absent (sample/fallback) the button is decorative —
 * it animates the press but takes no action.
 */
export function PlanPrimaryButton({
  state,
  planId,
  labelOverride,
  suggestedStart,
  scheduled,
  scheduleFixed,
  dayOf,
}: {
  state: PlanState;
  planId?: string;
  /** Optional label override (used on the Move page). */
  labelOverride?: string;
  /** Brain-suggested ISO start — prefills the date picker for "Add to Calendar". */
  suggestedStart?: string;
  /** True when the plan already has a committed schedule. */
  scheduled?: boolean;
  /** True when the date is an official, locked event time — Add-to-Calendar uses
   *  it directly; no rescheduling (only surrounding details are adjustable). */
  scheduleFixed?: boolean;
  /** True only when the plan's target date is today — the only time we "begin". */
  dayOf?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const config = configFor(state);
  // Fixed (event) plans before the day: the date is locked, so the move is to
  // drop the official time onto the calendar — not pick a new one.
  const isFixedFuture =
    Boolean(scheduleFixed) && !dayOf && (state === "ready" || state === "holding");
  // Flexible plans before the day: the move is to choose a time + put it on the
  // calendar, not start it tonight. "Begin Evening" only appears on the day.
  const isSchedulable =
    (state === "ready" || state === "holding") && !dayOf && !scheduleFixed;
  // On the day, ready/holding plans say "Begin <daypart>" — dynamic to the
  // plan's actual start time, not a hardcoded "Evening".
  const beginConfigLabel =
    state === "ready" || state === "holding"
      ? dynamicBeginLabel(suggestedStart)
      : config.label;
  const label =
    labelOverride ??
    (isFixedFuture
      ? "Add to Calendar"
      : isSchedulable
        ? scheduled
          ? "Reschedule"
          : "Add to Calendar"
        : beginConfigLabel);
  const disabled = config.disabled || (!planId && state !== "ready");

  // A fixed-date plan downloads its .ics directly (the date can't change).
  if (isFixedFuture && planId) {
    return (
      <a
        href={`/api/plans/${planId}/ics`}
        className="flex w-full items-center justify-center gap-3 rounded-md py-4 text-[11px] uppercase tracking-[0.22em] transition-opacity duration-300 ease-atmospheric active:translate-y-px"
        style={{ background: config.background, color: config.color, border: config.border }}
      >
        {label}
        <ArrowRightIcon size={14} stroke="currentColor" />
      </a>
    );
  }

  async function post(path: string): Promise<void> {
    const res = await fetch(`/api/plans/${planId}/${path}`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  }

  function run(action: "activate" | "complete" | "cancel") {
    if (!planId) return;
    setError(null);
    startTransition(async () => {
      try {
        await post(action);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  function handlePrimary() {
    if (isSchedulable) {
      setPickerOpen(true);
      return;
    }
    if (state === "ready" || state === "holding") run("activate");
    else if (state === "live") run("complete");
  }

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={handlePrimary}
        disabled={disabled || pending}
        className="flex w-full items-center justify-center gap-3 rounded-md py-4 text-[11px] uppercase tracking-[0.22em] transition-opacity duration-300 ease-atmospheric active:translate-y-px disabled:opacity-70"
        style={{
          background: config.background,
          color: config.color,
          border: config.border,
        }}
      >
        {pending ? "…" : label}
        {!disabled ? <ArrowRightIcon size={14} stroke="currentColor" /> : null}
      </button>

      {state === "live" && planId ? (
        <button
          type="button"
          onClick={() => run("cancel")}
          disabled={pending}
          className="mt-2 self-end text-[10px] uppercase tracking-[0.22em] transition-opacity duration-300 ease-atmospheric"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel plan
        </button>
      ) : null}

      {error ? (
        <span className="mt-2 text-[11px]" style={{ color: "#E07A6E" }}>
          {error}
        </span>
      ) : null}

      {planId ? (
        <DatePickerSheet
          planId={planId}
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onConfirmed={() => {
            setPickerOpen(false);
            router.refresh();
          }}
          initialFromIso={suggestedStart}
        />
      ) : null}
    </div>
  );
}

/** "Begin Morning/Afternoon/Evening/Night" from the plan's start time (local). */
function dynamicBeginLabel(iso?: string): string {
  if (!iso) return "Begin";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Begin";
  const h = d.getHours();
  if (h < 11) return "Begin Morning";
  if (h < 16) return "Begin Afternoon";
  if (h < 21) return "Begin Evening";
  return "Begin Night";
}

function configFor(state: PlanState): {
  label: string;
  background: string;
  color: string;
  border: string;
  disabled: boolean;
} {
  switch (state) {
    case "ready":
      return {
        label: "Begin Evening",
        background: "var(--text-primary)",
        color: "var(--bg)",
        border: "1px solid var(--text-primary)",
        disabled: false,
      };
    case "live":
      return {
        label: "Mark Complete",
        background: "var(--gold)",
        color: "var(--bg)",
        border: "1px solid var(--gold)",
        disabled: false,
      };
    case "after":
      return {
        label: "Completed",
        background: "transparent",
        color: "var(--text-muted)",
        border: "1px solid var(--border)",
        disabled: true,
      };
    case "holding":
    default:
      return {
        label: "Begin Evening",
        background: "var(--text-primary)",
        color: "var(--bg)",
        border: "1px solid var(--text-primary)",
        disabled: false,
      };
  }
}
