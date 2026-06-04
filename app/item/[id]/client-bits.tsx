"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ItemActionName =
  | "save"
  | "pass"
  | "archive"
  | "restore"
  | "complete"
  | "plan"
  | "move-radar"
  | "move-holding"
  | "add-upcoming"
  | "remove-upcoming"
  | "save-taste"
  | "interested-later"
  | "watch"
  | "better-version"
  | "mute";

export function GeneratePlanButton({
  itemId,
  label = "Plan this",
  force = false,
}: {
  itemId: string;
  label?: string;
  force?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "generating" | "ready">(
    "idle",
  );
  const [message, setMessage] = useState("Building plan…");

  function run() {
    setError(null);
    setMessage("Building plan…");
    setStatus("generating");
    startTransition(async () => {
      let timer: number | undefined;
      try {
        timer = window.setTimeout(
          () => setMessage("Preparing sections…"),
          900,
        );
        const res = await fetch(`/api/items/${itemId}/generate-plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: force ? JSON.stringify({ force: true }) : undefined,
        });
        const json = (await res.json()) as {
          ok?: true;
          plan_id?: string;
          plan_slug?: string;
          fallback_used?: boolean;
          reused?: boolean;
          error?: string;
        };
        if (!res.ok || json.error || !json.plan_slug) {
          setError(json.error ?? `HTTP ${res.status}`);
          setStatus("idle");
          return;
        }
        setStatus("ready");
        // Navigate to the new (or existing) plan
        router.push(`/plan/${json.plan_slug}`);
      } catch (err) {
        setError((err as Error).message);
        setStatus("idle");
      } finally {
        if (timer) window.clearTimeout(timer);
      }
    });
  }

  const isWorking = pending || status === "generating";

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={run}
        disabled={isWorking}
        className={
          "flex min-h-[56px] w-full items-center justify-center rounded-2xl border border-muted-gold/50 bg-muted-gold/10 px-5 py-3 text-[11px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:bg-muted-gold/20 disabled:opacity-60"
        }
      >
        {isWorking ? message : label}
      </button>
      {isWorking ? (
        <span className="mt-1 text-center text-[11px] text-warm-ivory/38">
          Concise draft. No bookings claimed.
        </span>
      ) : null}
      {error ? (
        <span className="mt-1 text-[11px] text-[#E07A6E]">{error}</span>
      ) : null}
    </div>
  );
}

export function ItemActionButton({
  itemId,
  action,
  label,
  variant = "secondary",
  redirectTo,
  size = "normal",
}: {
  itemId: string;
  action: ItemActionName;
  label: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  redirectTo?: string;
  size?: "normal" | "compact";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/items/${itemId}/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

  const className = buttonClass(variant, pending, size);

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={className}
      >
        {pending ? "…" : label}
      </button>
      {error ? (
        <span className="mt-1 text-[11px] text-[#E07A6E]">{error}</span>
      ) : null}
    </div>
  );
}

export function RefreshBriefingButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/items/${itemId}/refresh-briefing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const json = (await res.json()) as { ok?: true; error?: string };
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
    <div className="flex w-full flex-col items-stretch">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={buttonClass("ghost", pending)}
      >
        {pending ? "…" : "Refresh briefing"}
      </button>
      {error ? (
        <span className="mt-1 text-[11px] text-[#E07A6E]">{error}</span>
      ) : null}
    </div>
  );
}

export function PlanLifecycleButton({
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

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={buttonClass(variant, pending)}
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
  size: "normal" | "compact" = "normal",
): string {
  const base =
    size === "compact"
      ? "flex min-h-[40px] w-full items-center justify-center rounded-2xl px-4 py-2 text-[10px] uppercase tracking-editorial transition-colors duration-300 ease-atmospheric"
      : "flex min-h-[56px] w-full items-center justify-center rounded-2xl px-5 py-3 text-[11px] uppercase tracking-editorial transition-colors duration-300 ease-atmospheric";
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
