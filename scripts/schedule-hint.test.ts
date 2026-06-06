import assert from "node:assert/strict";
import { pickPlanDate } from "../lib/plans/scheduleHint";

const now = new Date("2026-06-08T15:00:00"); // a Monday afternoon
const daysBetween = (a: string) =>
  Math.round((new Date(`${a}T00:00:00`).getTime() - new Date("2026-06-08T00:00:00").getTime()) / 86400000);

// tonight / today → today, fixed
{
  const r = pickPlanDate("tonight", now);
  assert.equal(r.date, "2026-06-08");
  assert.equal(r.flexible, false);
  assert.equal(r.time, "19:30");
}
// tomorrow
{
  const r = pickPlanDate("tomorrow", now);
  assert.equal(r.date, "2026-06-09");
  assert.equal(r.flexible, false);
}
// named weekday → that weekday, fixed
{
  const r = pickPlanDate("friday", now);
  assert.equal(new Date(`${r.date}T12:00:00`).getDay(), 5, "friday lands on a Friday");
  assert.equal(r.flexible, false);
}
// time-of-day adjusts the hour
{
  const r = pickPlanDate("saturday morning", now);
  assert.equal(new Date(`${r.date}T12:00:00`).getDay(), 6);
  assert.equal(r.time, "10:00");
}
// open window → flexible best date inside the window
{
  const r = pickPlanDate("this week", now);
  assert.equal(r.flexible, true, "open window is flexible");
  const d = daysBetween(r.date);
  assert.ok(d > 0 && d <= 7, `within the week (got ${d}d)`);
  assert.ok([5, 6].includes(new Date(`${r.date}T12:00:00`).getDay()), "picks a Fri/Sat");
}
// "within the next week"
{
  const r = pickPlanDate("within the next week", now);
  assert.equal(r.flexible, true);
  assert.ok(daysBetween(r.date) <= 7);
}
// no hint at all → still picks a sensible flexible date (not today)
{
  const r = pickPlanDate(null, now);
  assert.equal(r.flexible, true);
  assert.ok(daysBetween(r.date) > 0 && daysBetween(r.date) <= 7);
}

console.log("✓ schedule-hint tests passed");
