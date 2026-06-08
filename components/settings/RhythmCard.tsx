"use client";

import { useState, useTransition } from "react";
import { updateRhythmPreferences } from "@/lib/actions/operatingPreferences";
import type { OperatingPreferences } from "@/lib/operating/operatingPreferences";
import { WeeklyRhythmForm } from "@/app/settings/client-bits";
import type { WeeklyRhythm } from "@/lib/schedule/weeklyRhythm";
import { SettingsCard, Chip, SummaryRow } from "./ui";

const PLAN_WINDOWS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "weekday_evening", label: "Weekday evenings" },
  { key: "weekend", label: "Weekends" },
  { key: "weekend_morning", label: "Weekend mornings" },
  { key: "weekday_lunch", label: "Weekday lunch" },
  { key: "late_night", label: "Late night" },
];

export function RhythmCard({
  initial,
  weeklyRhythm,
  weeklyRhythmSavedAt,
  editable,
}: {
  initial: OperatingPreferences;
  weeklyRhythm: WeeklyRhythm;
  weeklyRhythmSavedAt: string | null;
  editable: boolean;
}) {
  const [sundayReset, setSundayReset] = useState(initial.sundayReset);
  const [lowFriction, setLowFriction] = useState(initial.lowFrictionWeeknights);
  const [windows, setWindows] = useState<string[]>(initial.preferredPlanWindows);
  const [showCommute, setShowCommute] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function persist(patch: {
    sundayReset?: boolean;
    lowFrictionWeeknights?: boolean;
    preferredPlanWindows?: string[];
  }) {
    if (!editable) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateRhythmPreferences(patch);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save rhythm.");
      }
    });
  }

  function toggleSunday() {
    const next = !sundayReset;
    setSundayReset(next);
    persist({ sundayReset: next });
  }
  function toggleLowFriction() {
    const next = !lowFriction;
    setLowFriction(next);
    persist({ lowFrictionWeeknights: next });
  }
  function toggleWindow(key: string) {
    const next = windows.includes(key) ? windows.filter((w) => w !== key) : [...windows, key];
    setWindows(next);
    persist({ preferredPlanWindows: next });
  }

  const workdays = weeklyRhythm.workdays.length
    ? weeklyRhythm.workdays.map((d) => d.slice(0, 3)).join(", ")
    : "—";

  return (
    <SettingsCard label="Your week" title="Rhythm">
      <div className="flex flex-wrap gap-2">
        <Chip active={sundayReset} disabled={!editable || pending} onClick={toggleSunday}>
          Protect Sundays
        </Chip>
        <Chip active={lowFriction} disabled={!editable || pending} onClick={toggleLowFriction}>
          Low-friction weeknights
        </Chip>
      </div>

      <div className="mt-4 text-[10px] uppercase tracking-[0.18em] text-warm-ivory/45">
        Best plan windows
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {PLAN_WINDOWS.map((w) => (
          <Chip
            key={w.key}
            active={windows.includes(w.key)}
            disabled={!editable || pending}
            onClick={() => toggleWindow(w.key)}
          >
            {w.label}
          </Chip>
        ))}
      </div>

      <div className="mt-4">
        <SummaryRow label="Workdays" value={workdays} />
        <SummaryRow
          label="Commute"
          value={`${weeklyRhythm.leave_home} → home ${weeklyRhythm.arrive_home}`}
        />
      </div>

      {error ? <p className="mt-3 text-[12px] text-[#E07A6E]">{error}</p> : null}

      {editable ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowCommute((v) => !v)}
            className="text-[11px] uppercase tracking-[0.18em] text-muted-gold transition-colors hover:text-muted-gold/80"
          >
            {showCommute ? "Hide commute schedule" : "Edit commute schedule"}
          </button>
          {showCommute ? (
            <div className="mt-3 border-t border-divider/40 pt-4">
              <WeeklyRhythmForm rhythm={weeklyRhythm} lastSavedAt={weeklyRhythmSavedAt} />
            </div>
          ) : null}
        </div>
      ) : null}
    </SettingsCard>
  );
}
