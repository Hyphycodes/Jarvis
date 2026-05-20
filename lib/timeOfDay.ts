export type DayPart = "Morning" | "Afternoon" | "Evening" | "Night";

export function timeOfDay(date: Date = new Date()): DayPart {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 22) return "Evening";
  return "Night";
}

export function beginCopy(part: DayPart | "Plan"): string {
  return `Begin ${part}`;
}
