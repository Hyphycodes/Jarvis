// Pure, unit-testable: turn a loose timing hint ("this week", "Friday night",
// "tonight", "within the next week") into a concrete date+time to schedule a
// flexible plan. `flexible` = we chose a sensible best date inside a window the
// owner left open (so the UI can show it as a suggestion they can change).

export type PickedDate = {
  date: string; // YYYY-MM-DD (local)
  time: string; // HH:MM (24h)
  flexible: boolean;
  label: string; // human label, e.g. "Fri, Jun 12 · 8:00 PM"
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Days until the next given weekday (1..7; today counts as 7, i.e. next week). */
function daysUntilWeekday(from: Date, target: number): number {
  const diff = (target - from.getDay() + 7) % 7;
  return diff === 0 ? 7 : diff;
}

function timeOfDay(hint: string): string {
  if (/\bmorning\b/.test(hint)) return "10:00";
  if (/\b(afternoon|lunch|brunch)\b/.test(hint)) return "13:00";
  if (/\b(evening|night|dinner|tonight)\b/.test(hint)) return "19:30";
  return "19:30";
}

function label(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return `${date} ${time}`;
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t}`;
}

export function pickPlanDate(hint: string | null | undefined, now: Date = new Date()): PickedDate {
  const raw = (hint ?? "").trim().toLowerCase();
  const time = timeOfDay(raw);
  const make = (d: Date, flexible: boolean): PickedDate => ({
    date: ymd(d),
    time,
    flexible,
    label: label(ymd(d), time),
  });

  // Specific, fixed-ish phrases.
  if (/\b(tonight|today)\b/.test(raw)) return make(now, false);
  if (/\btomorrow\b/.test(raw)) return make(addDays(now, 1), false);
  if (/\bnext weekend\b/.test(raw)) {
    const sat = addDays(now, daysUntilWeekday(now, 6) + 7);
    return make(sat, false);
  }
  if (/\b(this )?weekend\b/.test(raw)) {
    return make(addDays(now, daysUntilWeekday(now, 6)), false);
  }
  // Named weekday (optionally "next ...").
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const re = new RegExp(`\\b${WEEKDAYS[i]}\\b`);
    if (re.test(raw)) {
      const base = daysUntilWeekday(now, i);
      const extra = /\bnext\b/.test(raw) ? 7 : 0;
      return make(addDays(now, base + extra), false);
    }
  }

  // Open windows → choose a best date inside the window (flexible).
  // Best = the upcoming Friday if it falls within the window, else Saturday,
  // else a few days out — a sensible "good night" the owner can adjust.
  if (/\b(this week|within (the )?(next )?week|next week|sometime|soon|flexible|whenever)\b/.test(raw) || raw === "") {
    const windowDays = /\bnext week\b/.test(raw) ? 14 : 7;
    const toFri = daysUntilWeekday(now, 5);
    const toSat = daysUntilWeekday(now, 6);
    if (toFri <= windowDays) return make(addDays(now, toFri), true);
    if (toSat <= windowDays) return make(addDays(now, toSat), true);
    return make(addDays(now, Math.min(3, windowDays)), true);
  }

  // Fallback: a few days out, flexible.
  return make(addDays(now, 3), true);
}
