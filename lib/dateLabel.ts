/**
 * Format a date as "May 12, 2025" — the editorial date label used in headers.
 */
export function dateLabel(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
