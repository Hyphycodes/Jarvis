import type { CircleGiftIdea, CircleImportantDate } from "@/lib/ai/types";

/** Defensive readers for the circle_people jsonb depth columns. */

export function readCircleImportantDates(value: unknown): CircleImportantDate[] {
  if (!Array.isArray(value)) return [];
  const out: CircleImportantDate[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const label = str(entry.label);
    const date = str(entry.date);
    if (!label || !date) continue;
    out.push({ label, date });
  }
  return out;
}

export function readCircleGiftIdeas(value: unknown): CircleGiftIdea[] {
  if (!Array.isArray(value)) return [];
  const out: CircleGiftIdea[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const idea = str(entry.idea);
    if (!idea) continue;
    out.push({
      idea,
      note: str(entry.note) ?? undefined,
      added_at: str(entry.added_at) ?? undefined,
    });
  }
  return out;
}

/**
 * Days until the next occurrence of an important date. Recurring "MM-DD"
 * dates roll to the next year when passed; "YYYY-MM-DD" dates are one-off.
 * Returns null when unparseable or a one-off date is in the past.
 */
export function daysUntilImportantDate(date: string, now = new Date()): number | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const oneOff = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (oneOff) {
    const target = new Date(Number(oneOff[1]), Number(oneOff[2]) - 1, Number(oneOff[3]));
    const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
    return diff >= 0 ? diff : null;
  }
  const recurring = /^(\d{2})-(\d{2})$/.exec(date.trim());
  if (recurring) {
    let target = new Date(now.getFullYear(), Number(recurring[1]) - 1, Number(recurring[2]));
    if (target.getTime() < today.getTime()) {
      target = new Date(now.getFullYear() + 1, Number(recurring[1]) - 1, Number(recurring[2]));
    }
    return Math.round((target.getTime() - today.getTime()) / 86_400_000);
  }
  return null;
}

export type ContactRhythmState = {
  daysSince: number | null;
  state: "warm" | "drifting" | "cold" | "unknown";
  line: string | null;
};

/** Read the connection rhythm: warm inside the cadence, drifting past it. */
export function contactRhythm(input: {
  lastInteraction?: string | null;
  lastSeenAt?: string | null;
  contactRhythmDays?: number | null;
}): ContactRhythmState {
  const last = input.lastSeenAt ?? input.lastInteraction;
  if (!last) return { daysSince: null, state: "unknown", line: null };
  const t = Date.parse(last);
  if (!Number.isFinite(t)) return { daysSince: null, state: "unknown", line: null };
  const daysSince = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
  const cadence = input.contactRhythmDays ?? 21;
  const state = daysSince <= cadence ? "warm" : daysSince <= cadence * 2 ? "drifting" : "cold";
  const line =
    daysSince === 0
      ? "Connected today."
      : daysSince === 1
        ? "Connected yesterday."
        : `Last connected ${daysSince} days ago.`;
  return { daysSince, state, line };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
