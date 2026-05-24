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
}: {
  state: PlanState;
  planId?: string;
  /** Optional label override (used on the Move page). */
  labelOverride?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const config = configFor(state);
  const label = labelOverride ?? config.label;
  const disabled = config.disabled || (!planId && state !== "ready");

  function run(action: "activate" | "complete" | "cancel") {
    if (!planId) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/plans/${planId}/${action}`, {
          method: "POST",
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: true;
          error?: string;
        };
        if (!res.ok || json.error) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
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
