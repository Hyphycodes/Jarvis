"use client";

import { useState, useTransition } from "react";
import { setOperatingMode } from "@/lib/actions/operatingPreferences";
import {
  OPERATING_MODES,
  modeMeaning,
  type OperatingMode,
} from "@/lib/operating/operatingPreferences";
import { SettingsCard, Chip } from "./ui";

export function OperatingModeCard({
  initialMode,
  editable,
}: {
  initialMode: OperatingMode;
  editable: boolean;
}) {
  const [mode, setMode] = useState<OperatingMode>(initialMode);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: OperatingMode) {
    if (!editable || next === mode) return;
    const prev = mode;
    setMode(next); // optimistic
    setError(null);
    startTransition(async () => {
      try {
        await setOperatingMode(next);
      } catch (err) {
        setMode(prev);
        setError(err instanceof Error ? err.message : "Couldn't change mode.");
      }
    });
  }

  return (
    <SettingsCard label="Current mode" title={labelFor(mode)}>
      <p className="text-[14px] leading-[1.5] text-warm-ivory/65">{modeMeaning(mode)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {OPERATING_MODES.map((m) => (
          <Chip
            key={m.key}
            active={m.key === mode}
            disabled={!editable || pending}
            onClick={() => choose(m.key)}
          >
            {m.label}
          </Chip>
        ))}
      </div>
      {error ? <p className="mt-3 text-[12px] text-[#E07A6E]">{error}</p> : null}
      {!editable ? (
        <p className="mt-3 text-[11px] text-warm-ivory/35">Read-only.</p>
      ) : null}
    </SettingsCard>
  );
}

function labelFor(mode: OperatingMode): string {
  return OPERATING_MODES.find((m) => m.key === mode)?.label ?? mode;
}
