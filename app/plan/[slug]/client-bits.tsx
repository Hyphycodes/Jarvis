"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PlanActionButton({
  planId,
  action,
  label,
  variant = "secondary",
  redirectTo,
}: {
  planId: string;
  action: "activate" | "complete" | "cancel";
  label: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/plans/${planId}/${action}`, {
          method: "POST",
        });
        const json = (await res.json()) as { ok?: true; error?: string };
        if (!res.ok || json.error) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  const cls = buttonClass(variant, pending);

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cls}
      >
        {pending ? "…" : label}
      </button>
      {error ? (
        <span className="mt-1 text-[11px] text-[#E07A6E]">{error}</span>
      ) : null}
    </div>
  );
}

function buttonClass(
  variant: "primary" | "secondary" | "danger" | "ghost",
  pending: boolean,
): string {
  const base =
    "rounded-full px-5 py-2.5 text-[11px] uppercase tracking-editorial transition-colors duration-300 ease-atmospheric";
  const disabled = pending ? " opacity-60" : "";
  switch (variant) {
    case "primary":
      return (
        base +
        " border border-muted-gold/50 bg-muted-gold/10 text-muted-gold hover:bg-muted-gold/20" +
        disabled
      );
    case "danger":
      return (
        base +
        " border border-[#E07A6E]/40 bg-[#E07A6E]/5 text-[#E07A6E] hover:bg-[#E07A6E]/10" +
        disabled
      );
    case "ghost":
      return (
        base +
        " border border-transparent text-warm-ivory/55 hover:text-warm-ivory/85" +
        disabled
      );
    case "secondary":
    default:
      return (
        base +
        " border border-white/[0.10] bg-white/[0.025] text-warm-ivory/85 hover:bg-white/[0.06]" +
        disabled
      );
  }
}
