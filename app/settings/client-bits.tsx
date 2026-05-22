"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { updateWeeklyRhythm } from "@/lib/actions/profile";
import {
  formatRhythmTime,
  type Weekday,
  type WeeklyRhythm,
} from "@/lib/schedule/weeklyRhythm";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="block border border-divider px-4 py-3 text-center text-[11px] uppercase tracking-editorial text-warm-ivory/85 transition-colors duration-300 ease-atmospheric hover:border-warm-ivory/40 disabled:opacity-50"
    >
      {pending ? "Refreshing…" : "Recheck status"}
    </button>
  );
}

export function ShowOrigin() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);
  if (!origin) {
    return <span className="text-[13px] text-warm-ivory/45">…</span>;
  }
  return <span className="break-all text-[13px] text-warm-ivory/85">{origin}</span>;
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="min-h-7 px-2 text-[9px] uppercase tracking-editorial text-muted-gold/65 transition duration-300 ease-atmospheric hover:text-muted-gold active:translate-y-px"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const RHYTHM_DAYS: { value: Weekday; label: string }[] = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

export function WeeklyRhythmForm({
  rhythm,
  lastSavedAt,
}: {
  rhythm: WeeklyRhythm;
  lastSavedAt?: string | null;
}) {
  const [state, formAction] = useActionState(updateWeeklyRhythm, { ok: false });
  const savedAt = state.savedAt ?? lastSavedAt;
  return (
    <form
      action={formAction}
      className="rounded-md border border-divider/55 bg-soft-black/25 px-4 py-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-[22px] italic leading-tight text-warm-ivory">
            Recurring schedule
          </h2>
          <p className="mt-2 max-w-[38ch] text-[13px] leading-[1.55] text-warm-ivory/58">
            Used by Today and planning so workdays stay quiet until the right
            window opens.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[10px] uppercase tracking-editorial text-warm-ivory/55">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={rhythm.enabled}
            className="h-4 w-4 accent-muted-gold"
          />
          On
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {RHYTHM_DAYS.map((day) => (
          <label
            key={day.value}
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-divider/60 px-3 text-[11px] uppercase tracking-editorial text-warm-ivory/65"
          >
            <input
              type="checkbox"
              name="workdays"
              value={day.value}
              defaultChecked={rhythm.workdays.includes(day.value)}
              className="h-3.5 w-3.5 accent-muted-gold"
            />
            {day.label}
          </label>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <TimeField label="Leave home" name="leave_home" value={rhythm.leave_home} />
        <TimeField label="Work start" name="work_start" value={rhythm.work_start} />
        <TimeField
          label="Leave Schaumburg"
          name="leave_work"
          value={rhythm.leave_work}
        />
        <TimeField label="Home" name="arrive_home" value={rhythm.arrive_home} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <TextField
          label="Work location"
          name="work_location"
          value={rhythm.work_location}
        />
        <TextField label="Timezone" name="timezone" value={rhythm.timezone} />
      </div>

      {state.message || state.error ? (
        <div
          className={
            "mt-4 rounded-md border px-3 py-3 text-[12px] leading-[1.45] " +
            (state.ok
              ? "border-muted-gold/30 bg-muted-gold/[0.06] text-muted-gold"
              : "border-[#E07A6E]/30 bg-[#E07A6E]/[0.06] text-[#E07A6E]")
          }
        >
          {state.message ?? state.error}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-divider/45 pt-4">
        <p className="text-[12px] leading-[1.45] text-warm-ivory/45">
          Mon-Fri, {formatRhythmTime(rhythm.leave_home)} to{" "}
          {formatRhythmTime(rhythm.arrive_home)}.
          {savedAt ? (
            <>
              <br />
              Last saved: {formatSavedAt(savedAt)}
            </>
          ) : null}
        </p>
        <SaveRhythmButton />
      </div>
    </form>
  );
}

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SaveRhythmButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-10 shrink-0 border border-muted-gold/45 px-4 text-[10px] uppercase tracking-editorial text-muted-gold transition duration-300 ease-atmospheric hover:border-muted-gold active:translate-y-px disabled:opacity-55"
    >
      {pending ? "Saving" : "Save"}
    </button>
  );
}

function TimeField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] uppercase tracking-editorial text-warm-ivory/38">
        {label}
      </span>
      <input
        type="time"
        name={name}
        defaultValue={value}
        className="min-h-11 rounded-md border border-divider/60 bg-near-black px-3 text-[14px] text-warm-ivory outline-none transition-colors duration-300 ease-atmospheric focus:border-muted-gold/55"
      />
    </label>
  );
}

function TextField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] uppercase tracking-editorial text-warm-ivory/38">
        {label}
      </span>
      <input
        type="text"
        name={name}
        defaultValue={value}
        className="min-h-11 rounded-md border border-divider/60 bg-near-black px-3 text-[14px] text-warm-ivory outline-none transition-colors duration-300 ease-atmospheric focus:border-muted-gold/55"
      />
    </label>
  );
}
