"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ControlRoomActions({
  enabled,
  activeRunId,
  foundationSprintEnabled,
}: {
  enabled: boolean;
  activeRunId?: string | null;
  foundationSprintEnabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [tasteSeed, setTasteSeed] = useState("");
  const [tasteSeedOpen, setTasteSeedOpen] = useState(false);

  function run(label: string, request: () => Promise<Response>) {
    setMessage(`${label}...`);
    startTransition(async () => {
      const response = await request();
      const json = (await response.json().catch(() => ({}))) as {
        summary?: unknown;
        error?: string;
      };
      setMessage(readSummary(json.summary) ?? json.error ?? (response.ok ? `${label} requested.` : `${label} failed.`));
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
          disabled={pending}
          onClick={() => run("Foundation Sprint", () =>
            fetch("/api/radar/autopilot", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ mode: "foundation_sprint", start: true, runNow: true }),
            }))}
          className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/70 disabled:opacity-45"
        >
          Start Sprint
        </button>
        <button
          type="button"
          disabled={pending || !foundationSprintEnabled}
          onClick={() => run("Next Mission", () =>
            fetch("/api/radar/autopilot", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ mode: "foundation_sprint", runNow: true }),
            }))}
          className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/70 disabled:opacity-35"
        >
          Run Next Mission
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
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pending || !foundationSprintEnabled}
          onClick={() => run("Pause Sprint", () =>
            fetch("/api/radar/autopilot/pause", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ foundationSprint: true, reason: "owner_requested" }),
            }))}
          className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/60 disabled:opacity-35"
        >
          Pause Sprint
        </button>
        <button
          type="button"
          disabled={pending || foundationSprintEnabled}
          onClick={() => run("Resume Sprint", () =>
            fetch("/api/radar/autopilot/resume", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ foundationSprint: true }),
            }))}
          className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/60 disabled:opacity-35"
        >
          Resume Sprint
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
      <button
        type="button"
        disabled={pending}
        onClick={() => setTasteSeedOpen((open) => !open)}
        className="mt-2 text-left text-[11px] uppercase tracking-editorial text-warm-ivory/42"
      >
        {tasteSeedOpen ? "Hide Taste Seed Import" : "Paste Taste Seed"}
      </button>
      {tasteSeedOpen ? (
        <div className="grid gap-2">
          <textarea
            value={tasteSeed}
            onChange={(event) => setTasteSeed(event.target.value)}
            placeholder="Paste JARVIS TASTE SEED markdown"
            className="min-h-28 resize-y rounded-[var(--radius-card)] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-warm-ivory/80 placeholder:text-warm-ivory/25 focus:outline-none focus:ring-1 focus:ring-muted-gold/40"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={pending || !tasteSeed.trim()}
              onClick={() => run("Taste Seed Dry Run", () =>
                fetch("/api/library/import-taste-seed", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ markdown: tasteSeed, fileName: "JARVIS TASTE SEED.md", dryRun: true }),
                }))}
              className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/60 disabled:opacity-35"
            >
              Dry Run
            </button>
            <button
              type="button"
              disabled={pending || !tasteSeed.trim()}
              onClick={() => run("Taste Seed Commit", () =>
                fetch("/api/library/import-taste-seed", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ markdown: tasteSeed, fileName: "JARVIS TASTE SEED.md", dryRun: false }),
                }))}
              className="lux-surface-quiet min-h-11 rounded-[var(--radius-card)] px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/70 disabled:opacity-35"
            >
              Commit Import
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function readSummary(summary: unknown): string | null {
  if (typeof summary === "string") return summary;
  if (!summary || typeof summary !== "object") return null;
  const value = summary as {
    people?: number;
    places?: number;
    upcomingEvents?: number;
    tasteSignals?: number;
    negativeFilters?: number;
    discoverySources?: number;
    notes?: number;
    created?: Record<string, number>;
    updated?: Record<string, number>;
    skipped?: Record<string, number>;
    wouldCreate?: Record<string, number>;
  };
  if (value.created || value.updated || value.skipped) {
    return `Import: people ${value.people ?? 0}, places ${value.places ?? 0}, sources ${value.discoverySources ?? 0}. Created ${sum(value.created)}, updated ${sum(value.updated)}, skipped ${sum(value.skipped)}.`;
  }
  if (value.wouldCreate) {
    return `Dry run: people ${value.people ?? 0}, places ${value.places ?? 0}, sources ${value.discoverySources ?? 0}, notes ${value.notes ?? 0}.`;
  }
  return null;
}

function sum(value: Record<string, number> | undefined): number {
  return Object.values(value ?? {}).reduce((total, count) => total + count, 0);
}
