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
  phase:
    | "off_day"
    | "before_commute"
    | "morning_commute"
    | "work"
    | "home_commute"
    | "evening";
  label: string;
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
    leave_home: cleanTime(value.leave_home, DEFAULT_WEEKLY_RHYTHM.leave_home),
    work_start: cleanTime(value.work_start, DEFAULT_WEEKLY_RHYTHM.work_start),
    leave_work: cleanTime(value.leave_work, DEFAULT_WEEKLY_RHYTHM.leave_work),
    arrive_home: cleanTime(value.arrive_home, DEFAULT_WEEKLY_RHYTHM.arrive_home),
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
  return normalizeWeeklyRhythm(rhythm) as unknown as Json;
}

export function getDayRhythmState(
  rhythmInput: unknown,
  now: Date = new Date(),
): DayRhythmState {
  const rhythm = normalizeWeeklyRhythm(rhythmInput);
  const weekday = WEEKDAYS[now.getDay()];
  const isWorkday = rhythm.enabled && rhythm.workdays.includes(weekday);
  if (!isWorkday) {
    return { isWorkday: false, phase: "off_day", label: "Off day" };
  }

  const minute = now.getHours() * 60 + now.getMinutes();
  const leaveHome = timeToMinutes(rhythm.leave_home);
  const workStart = timeToMinutes(rhythm.work_start);
  const leaveWork = timeToMinutes(rhythm.leave_work);
  const arriveHome = timeToMinutes(rhythm.arrive_home);

  if (minute < leaveHome) {
    return { isWorkday: true, phase: "before_commute", label: "Before work" };
  }
  if (minute < workStart) {
    return {
      isWorkday: true,
      phase: "morning_commute",
      label: "Morning commute",
    };
  }
  if (minute < leaveWork) {
    return { isWorkday: true, phase: "work", label: "Work block" };
  }
  if (minute < arriveHome) {
    return {
      isWorkday: true,
      phase: "home_commute",
      label: "Return window",
    };
  }
  return { isWorkday: true, phase: "evening", label: "Evening" };
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

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "string" && WEEKDAYS.includes(value as Weekday);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
