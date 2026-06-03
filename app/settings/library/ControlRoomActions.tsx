"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ControlRoomActions({
  enabled,
  activeRunId,
}: {
  enabled: boolean;
  activeRunId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(label: string, request: () => Promise<Response>) {
    setMessage(`${label}...`);
    startTransition(async () => {
      const response = await request();
      const json = (await response.json().catch(() => ({}))) as { summary?: string; error?: string };
      setMessage(json.summary ?? json.error ?? (response.ok ? `${label} requested.` : `${label} failed.`));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run("Bootstrap", () =>
            fetch("/api/radar/autopilot", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ mode: "bootstrap" }),
            }))}
          className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/70 disabled:opacity-45"
        >
          Run Bootstrap
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run("Autopilot", () =>
            fetch("/api/radar/autopilot", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ mode: "owner_requested" }),
            }))}
          className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/70 disabled:opacity-45"
        >
          Run Autopilot
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pending || !enabled}
          onClick={() => run("Pause", () =>
            fetch("/api/radar/autopilot/pause", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ reason: "owner_requested" }),
            }))}
          className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/60 disabled:opacity-35"
        >
          Pause
        </button>
        <button
          type="button"
          disabled={pending || enabled}
          onClick={() => run("Resume", () => fetch("/api/radar/autopilot/resume", { method: "POST" }))}
          className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/60 disabled:opacity-35"
        >
          Resume
        </button>
      </div>
      <button
        type="button"
        disabled={pending || !activeRunId}
        onClick={() => run("Stop", () =>
          fetch("/api/radar/autopilot/stop", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ runId: activeRunId }),
          }))}
        className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/50 disabled:opacity-30"
      >
        Stop After Current Step
      </button>
      {message ? (
        <p className="text-[11px] leading-relaxed text-warm-ivory/45">
          {message}
        </p>
      ) : null}
    </div>
  );
}
