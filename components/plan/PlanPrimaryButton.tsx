"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "./icons";
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
}: {
  state: PlanState;
  planId?: string;
  /** Optional label override (used on the Move page). */
  labelOverride?: string;
  /** Brain-suggested ISO start — committed before activating when not scheduled. */
  suggestedStart?: string;
  /** True when the plan already has a committed schedule. */
  scheduled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const config = configFor(state);
  const label = labelOverride ?? config.label;
  const disabled = config.disabled || (!planId && state !== "ready");

  async function post(path: string, body?: unknown): Promise<void> {
    const res = await fetch(`/api/plans/${planId}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  }

  function run(action: "activate" | "complete" | "cancel") {
    if (!planId) return;
    setError(null);
    startTransition(async () => {
      try {
        // "Suggest a time, then begin": commit the brain's suggested slot before
        // activating, so the plan lands on the calendar with a real date/time.
        if (action === "activate" && !scheduled) {
          const slot = scheduleSlotFromIso(suggestedStart);
          if (slot) {
            await post("schedule", {
              scheduled_date: slot.date,
              scheduled_time: slot.time,
            }).catch(() => undefined);
          }
        }
        await post(action);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={() => {
          if (state === "ready" || state === "holding") run("activate");
          else if (state === "live") run("complete");
        }}
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
    </div>
  );
}

/** Parse an ISO datetime into a local { date: YYYY-MM-DD, time: HH:MM } slot. */
function scheduleSlotFromIso(
  iso?: string,
): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
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
