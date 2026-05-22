import type { Json } from "@/lib/types/database";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type WeeklyRhythm = {
  enabled: boolean;
  workdays: Weekday[];
  leave_home: string;
  work_start: string;
  leave_work: string;
  arrive_home: string;
  work_location: string;
  timezone: string;
};

export type DayRhythmState = {
  isWorkday: boolean;
  weekday: Weekday;
  minuteOfDay: number;
  phase:
    | "off_day"
    | "before_commute"
    | "morning_commute"
    | "work"
    | "home_commute"
    | "evening";
  label: string;
};

export type WeeklyRhythmTodayRowPlan = {
  key: "work_block" | "head_home";
  shouldRender: boolean;
  reason: string;
  time: string;
  title: string;
  details: string;
  locationLine?: string;
  timingNote?: string;
};

export const DEFAULT_WEEKLY_RHYTHM: WeeklyRhythm = {
  enabled: true,
  workdays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  leave_home: "06:20",
  work_start: "07:00",
  leave_work: "15:30",
  arrive_home: "16:30",
  work_location: "Schaumburg",
  timezone: "America/Chicago",
};

const WEEKDAYS: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function normalizeWeeklyRhythm(value: unknown): WeeklyRhythm {
  if (!isRecord(value)) return DEFAULT_WEEKLY_RHYTHM;
  const workdays = Array.isArray(value.workdays)
    ? value.workdays.filter(isWeekday)
    : DEFAULT_WEEKLY_RHYTHM.workdays;
  return {
    enabled:
      typeof value.enabled === "boolean"
        ? value.enabled
        : DEFAULT_WEEKLY_RHYTHM.enabled,
    workdays: workdays.length > 0 ? workdays : DEFAULT_WEEKLY_RHYTHM.workdays,
    leave_home: cleanTime(
      value.leave_home_time ?? value.leave_home,
      DEFAULT_WEEKLY_RHYTHM.leave_home,
    ),
    work_start: cleanTime(
      value.work_start_time ?? value.work_start,
      DEFAULT_WEEKLY_RHYTHM.work_start,
    ),
    leave_work: cleanTime(
      value.leave_work_time ?? value.leave_work,
      DEFAULT_WEEKLY_RHYTHM.leave_work,
    ),
    arrive_home: cleanTime(
      value.home_arrival_time ?? value.arrive_home,
      DEFAULT_WEEKLY_RHYTHM.arrive_home,
    ),
    work_location:
      typeof value.work_location === "string" && value.work_location.trim()
        ? value.work_location.trim()
        : DEFAULT_WEEKLY_RHYTHM.work_location,
    timezone:
      typeof value.timezone === "string" && value.timezone.trim()
        ? value.timezone.trim()
        : DEFAULT_WEEKLY_RHYTHM.timezone,
  };
}

export function weeklyRhythmToJson(rhythm: WeeklyRhythm): Json {
  const normalized = normalizeWeeklyRhythm(rhythm);
  return {
    ...normalized,
    leave_home_time: normalized.leave_home,
    work_start_time: normalized.work_start,
    leave_work_time: normalized.leave_work,
    home_arrival_time: normalized.arrive_home,
  } as unknown as Json;
}

export function getDayRhythmState(
  rhythmInput: unknown,
  now: Date = new Date(),
): DayRhythmState {
  const rhythm = normalizeWeeklyRhythm(rhythmInput);
  const weekday = getZonedWeekday(now, rhythm.timezone);
  const isWorkday = rhythm.enabled && rhythm.workdays.includes(weekday);
  if (!isWorkday) {
    return {
      isWorkday: false,
      weekday,
      minuteOfDay: getZonedMinuteOfDay(now, rhythm.timezone),
      phase: "off_day",
      label: "Off day",
    };
  }

  const minute = getZonedMinuteOfDay(now, rhythm.timezone);
  const leaveHome = timeToMinutes(rhythm.leave_home);
  const workStart = timeToMinutes(rhythm.work_start);
  const leaveWork = timeToMinutes(rhythm.leave_work);
  const arriveHome = timeToMinutes(rhythm.arrive_home);

  if (minute < leaveHome) {
    return {
      isWorkday: true,
      weekday,
      minuteOfDay: minute,
      phase: "before_commute",
      label: "Before work",
    };
  }
  if (minute < workStart) {
    return {
      isWorkday: true,
      weekday,
      minuteOfDay: minute,
      phase: "morning_commute",
      label: "Morning commute",
    };
  }
  if (minute < leaveWork) {
    return {
      isWorkday: true,
      weekday,
      minuteOfDay: minute,
      phase: "work",
      label: "Work block",
    };
  }
  if (minute < arriveHome) {
    return {
      isWorkday: true,
      weekday,
      minuteOfDay: minute,
      phase: "home_commute",
      label: "Return window",
    };
  }
  return {
    isWorkday: true,
    weekday,
    minuteOfDay: minute,
    phase: "evening",
    label: "Evening",
  };
}

export function planWeeklyRhythmTodayRows(
  rhythmInput: unknown,
  now: Date = new Date(),
): {
  state: DayRhythmState;
  rows: WeeklyRhythmTodayRowPlan[];
  hiddenReasons: string[];
} {
  const rhythm = normalizeWeeklyRhythm(rhythmInput);
  const state = getDayRhythmState(rhythm, now);
  const leaveWorkMinute = timeToMinutes(rhythm.leave_work);
  const headHomePreviewMinute = Math.max(0, leaveWorkMinute - 60);
  const headHomeHideMinute = timeToMinutes("17:30");
  const rows: WeeklyRhythmTodayRowPlan[] = [];
  const hiddenReasons: string[] = [];

  if (!state.isWorkday) {
    hiddenReasons.push(`${state.weekday} is not a saved workday.`);
    return { state, rows, hiddenReasons };
  }

  if (state.minuteOfDay < leaveWorkMinute) {
    rows.push({
      key: "work_block",
      shouldRender: true,
      reason: "before leave-work time",
      time: formatRhythmTime(rhythm.work_start),
      title: "Work block",
      details: `Leave home: ${formatRhythmTime(rhythm.leave_home)} · Start work: ${formatRhythmTime(rhythm.work_start)}`,
      locationLine: rhythm.work_location,
      timingNote: "Keep the day quiet until the work window closes.",
    });
  } else {
    hiddenReasons.push("Work block hidden after leave-work time.");
  }

  if (
    state.minuteOfDay >= headHomePreviewMinute &&
    state.minuteOfDay < headHomeHideMinute
  ) {
    rows.push({
      key: "head_home",
      shouldRender: true,
      reason: "inside head-home window",
      time: formatRhythmTime(rhythm.leave_work),
      title: "Head home",
      details: `Leave ${rhythm.work_location}: ${formatRhythmTime(rhythm.leave_work)} · Expected home: ${formatRhythmTime(rhythm.arrive_home)}`,
      timingNote: "Evening decisions can wait until you're back home.",
    });
  } else if (state.minuteOfDay < headHomePreviewMinute) {
    hiddenReasons.push("Head home hidden until one hour before leave-work time.");
  } else {
    hiddenReasons.push("Head home hidden after 5:30 PM.");
  }

  return { state, rows, hiddenReasons };
}

export function formatRhythmTime(value: string): string {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function cleanTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function timeToMinutes(value: string): number {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function getZonedMinuteOfDay(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function getZonedWeekday(now: Date, timeZone: string): Weekday {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(now);
  return label.toLowerCase() as Weekday;
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "string" && WEEKDAYS.includes(value as Weekday);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
