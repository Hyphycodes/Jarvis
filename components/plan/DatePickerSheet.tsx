"use client";

import { useState } from "react";
import { X, CalendarPlus } from "lucide-react";
import { MonthGrid } from "@/components/calendar/MonthGrid";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];

export function DatePickerSheet({
  planId,
  open,
  onClose,
  onConfirmed,
  initialFromIso,
}: {
  planId: string;
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
  /** Prefill date + time from the brain's suggested ISO start. */
  initialFromIso?: string;
}) {
  const initial = parseInitial(initialFromIso);
  const [selectedKey, setSelectedKey] = useState<string>(initial?.key ?? "");
  const [hour, setHour] = useState(initial?.hour ?? 7);
  const [minute, setMinute] = useState(initial?.minute ?? "00");
  const [meridiem, setMeridiem] = useState<"AM" | "PM">(initial?.meridiem ?? "PM");
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!selectedKey) {
      setError("Pick a date first.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      let h = hour % 12;
      if (meridiem === "PM") h += 12;
      const scheduled_time = `${String(h).padStart(2, "0")}:${minute}`;
      const res = await fetch(`/api/plans/${planId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_date: selectedKey,
          scheduled_time,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const json = (await res.json()) as { ok?: true; error?: string };
      if (!res.ok || json.error) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setConfirmed(true);
      onConfirmed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/55"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[440px] rounded-t-[20px] bg-[#0a0a09] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4"
        role="dialog"
        aria-label="Choose a date"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.2em] text-warm-ivory/55">
            {confirmed ? "Scheduled" : "Choose a date"}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center text-warm-ivory/55 hover:text-warm-ivory"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {confirmed ? (
          <div className="py-4">
            <p className="text-[15px] leading-[1.5] text-warm-ivory/80">
              Added to your calendar. The plan is finishing in the background.
            </p>
            <a
              href={`/api/plans/${planId}/ics`}
              className="mt-4 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-[#D4AF53] hover:text-[#D4AF53]/80"
            >
              <CalendarPlus size={15} strokeWidth={1.5} /> Add to Apple / Google
              Calendar
            </a>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl border border-white/[0.10] bg-white/[0.025] text-[12px] uppercase tracking-[0.2em] text-warm-ivory/85"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <MonthGrid
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              disablePast
            />

            <div className="mt-5 flex items-center justify-center gap-2">
              <TimeSelect
                value={hour}
                onChange={(v) => setHour(Number(v))}
                options={HOURS.map((h) => ({ label: String(h), value: String(h) }))}
              />
              <span className="text-warm-ivory/50">:</span>
              <TimeSelect
                value={minute}
                onChange={setMinute}
                options={MINUTES.map((m) => ({ label: m, value: m }))}
              />
              <TimeSelect
                value={meridiem}
                onChange={(v) => setMeridiem(v as "AM" | "PM")}
                options={[
                  { label: "AM", value: "AM" },
                  { label: "PM", value: "PM" },
                ]}
              />
            </div>

            {error ? (
              <p className="mt-3 text-center text-[12px] text-[#E07A6E]">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="mt-5 flex min-h-[54px] w-full items-center justify-center rounded-2xl border border-[#D4AF53] px-5 text-[12px] uppercase tracking-[0.22em] text-[#D4AF53] transition-colors hover:bg-[#D4AF53]/10 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Confirm Date"}
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** Parse an ISO start into the picker's initial date + 15-min-rounded time. */
function parseInitial(
  iso?: string,
): { key: string; hour: number; minute: string; meridiem: "AM" | "PM" } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const meridiem: "AM" | "PM" = d.getHours() >= 12 ? "PM" : "AM";
  const hour12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const slots = [0, 15, 30, 45];
  const nearest = slots.reduce(
    (a, b) => (Math.abs(b - d.getMinutes()) < Math.abs(a - d.getMinutes()) ? b : a),
    0,
  );
  return { key, hour: hour12, minute: pad(nearest), meridiem };
}

function TimeSelect({
  value,
  onChange,
  options,
}: {
  value: string | number;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <select
      value={String(value)}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[15px] text-warm-ivory focus:border-[#D4AF53]/50 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[#0a0a09]">
          {o.label}
        </option>
      ))}
    </select>
  );
}
