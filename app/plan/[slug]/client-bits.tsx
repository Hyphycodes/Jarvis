"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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

export function PlanBuildOnTap({
  planId,
  initialBuildStatus,
  sectionCount,
}: {
  planId: string;
  initialBuildStatus: string;
  sectionCount: number;
}) {
  const router = useRouter();
  const startedRef = useRef(false);
  const [state, setState] = useState<"building" | "failed">("building");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sectionCount > 0 || !isBuildableStatus(initialBuildStatus)) return;
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function pollStatus() {
      try {
        const res = await fetch(`/api/plans/${planId}/status`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          build_status?: string;
          section_count?: number;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || json.error) {
          setState("failed");
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        if (json.build_status === "ready" && (json.section_count ?? 0) > 0) {
          router.refresh();
          return;
        }
        if (json.build_status === "failed") {
          setState("failed");
          setError("The plan build failed. The generator error is logged.");
          return;
        }
        timer = setTimeout(pollStatus, 2500);
      } catch (err) {
        if (cancelled) return;
        setState("failed");
        setError((err as Error).message);
      }
    }

    async function startBuild() {
      setState("building");
      setError(null);
      try {
        const res = await fetch(`/api/plans/${planId}/build-now`, {
          method: "POST",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          build_status?: string;
          section_count?: number;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || json.error) {
          setState("failed");
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        if (json.build_status === "ready" && (json.section_count ?? 0) > 0) {
          router.refresh();
          return;
        }
        if (json.build_status === "failed") {
          setState("failed");
          setError("The plan build failed. The generator error is logged.");
          return;
        }
        timer = setTimeout(pollStatus, 1500);
      } catch (err) {
        if (cancelled) return;
        setState("failed");
        setError((err as Error).message);
      }
    }

    void startBuild();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [initialBuildStatus, planId, router, sectionCount]);

  function retry() {
    startedRef.current = false;
    setState("building");
    setError(null);
    router.refresh();
  }

  const failed = state === "failed";

  return (
    <section
      className="mx-5 mt-4 rounded-md border px-4 py-5"
      style={{
        borderColor: failed ? "rgba(224,122,110,0.35)" : "rgba(255,255,255,0.10)",
        background: failed ? "rgba(224,122,110,0.04)" : "rgba(255,255,255,0.025)",
      }}
    >
      <div className="flex items-center gap-3">
        {!failed ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#D4AF53]" />
        ) : null}
        <div>
          <p
            className="text-[11px] uppercase tracking-[0.2em]"
            style={{ color: failed ? "#E07A6E" : "var(--gold-soft)" }}
          >
            {failed ? "Plan build failed" : "Building plan"}
          </p>
          <p className="mt-2 text-[13px] leading-[1.5] text-warm-ivory/55">
            {failed
              ? (error ?? "The generator error was logged.")
              : "Jarvis is filling the dossier now."}
          </p>
        </div>
      </div>
      {failed ? (
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-full border border-[#E07A6E]/35 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[#E07A6E] transition-colors hover:bg-[#E07A6E]/10"
        >
          Retry build
        </button>
      ) : null}
    </section>
  );
}

function isBuildableStatus(status: string): boolean {
  return status === "building" || status === "failed";
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
