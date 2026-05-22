"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type RefreshSummary = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  next_allowed_at?: string;
  candidates_found: number;
  inserted: number;
  updated: number;
  shortlisted: number;
  selected: number;
  rejected: number;
  expired: number;
  fallback_used: boolean;
  fallback_reason?: string;
  decision_run_id: string | null;
  errors: string[];
};

export function RefreshRadarButton({
  forceAllowed = false,
}: {
  forceAllowed?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RefreshSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(force?: boolean) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/radar/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: force ? JSON.stringify({ force: true }) : undefined,
        });
        const json = (await res.json()) as RefreshSummary | { error: string };
        if (!res.ok || ("error" in json && json.error)) {
          setError("error" in json ? (json as { error: string }).error : `HTTP ${res.status}`);
          return;
        }
        setResult(json as RefreshSummary);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  const isCooldown = result?.skipped && result.reason === "cooldown";

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => run()}
          disabled={pending}
          className="rounded-full border border-muted-gold/40 bg-muted-gold/5 px-5 py-2 text-[12px] uppercase tracking-editorial text-muted-gold transition-colors duration-300 ease-atmospheric hover:bg-muted-gold/10 disabled:opacity-60"
        >
          {pending ? "Refreshing…" : "Refresh Radar"}
        </button>

        {isCooldown && forceAllowed ? (
          <button
            type="button"
            onClick={() => run(true)}
            disabled={pending}
            className="text-[11px] uppercase tracking-editorial text-warm-ivory/40 transition-colors duration-300 ease-atmospheric hover:text-warm-ivory/70"
          >
            Force
          </button>
        ) : null}
      </div>

      {result && !result.skipped ? (
        <p className="mt-3 text-[12px] leading-[1.6] text-warm-ivory/65">
          {result.candidates_found > 0
            ? `Found ${result.candidates_found} · inserted ${result.inserted} · updated ${result.updated} · `
            : ""}
          shortlisted {result.shortlisted} · selected {result.selected} ·
          rejected {result.rejected} · expired {result.expired}
          {result.fallback_used ? " · fallback brain" : " · Claude brain"}
          {result.fallback_reason ? ` · ${result.fallback_reason}` : ""}
        </p>
      ) : null}

      {isCooldown ? (
        <p className="mt-3 text-[12px] text-warm-ivory/45">
          Radar was refreshed recently. Next refresh allowed{" "}
          {result?.next_allowed_at
            ? formatRelative(result.next_allowed_at)
            : "soon"}
          .
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 text-[12px] text-[#E07A6E]">{error}</p>
      ) : null}
    </div>
  );
}

function formatRelative(iso: string): string {
  try {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return "now";
    const minutes = Math.ceil(diff / 60_000);
    return `in ${minutes} min`;
  } catch {
    return "soon";
  }
}
