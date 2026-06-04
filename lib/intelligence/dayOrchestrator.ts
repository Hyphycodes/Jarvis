import "server-only";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const DAY_ORCHESTRATOR_SOURCE = "day_orchestrator";
const ALERT_TTL_HOURS = 18; // auto-expire after 18h — stale day alerts shouldn't persist

/**
 * Reasons across today's timeline and writes seam-awareness alerts.
 * Called from daily_maintenance, ideally early (before the user starts their day).
 *
 * Writes to circle_updates with source='day_orchestrator' — these are tagged
 * as day_alert in rowToCircleTodayItem and render inline-expandable on Today.
 */
export async function runDayOrchestrator(
  userId: string,
  supabase?: SupabaseClient,
): Promise<{ alerts_written: number }> {
  const db = supabase ?? getSupabaseServiceClient();
  let alerts_written = 0;

  try {
    // Clean up stale day orchestrator alerts from previous runs
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - ALERT_TTL_HOURS);
    await db
      .from("circle_updates")
      .delete()
      .eq("user_id", userId)
      .eq("source", DAY_ORCHESTRATOR_SOURCE)
      .lt("created_at", cutoff.toISOString());

    // Fetch today's timeline items (sorted by sort_order)
    const today = new Date();

    const { data: timelineRows } = await db
      .from("today_timeline_items")
      .select("id, plan_id, time, title, status, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });

    const timeline = (timelineRows ?? []) as Array<{
      id: string;
      plan_id: string | null;
      time: string;
      title: string;
      status: string;
      sort_order: number;
    }>;

    if (timeline.length === 0) return { alerts_written };

    // Fetch weekly rhythm for context
    const { data: profileData } = await db
      .from("founder_profile")
      .select("weekly_rhythm")
      .eq("user_id", userId)
      .maybeSingle();

    const rhythm = (
      profileData as {
        weekly_rhythm?: {
          enabled?: boolean;
          workdays?: string[];
          leave_home?: string;
          leave_work?: string;
          arrive_home?: string;
        } | null;
      } | null
    )?.weekly_rhythm;

    const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
    const isWorkday = rhythm?.workdays?.includes(dayName) ?? false;

    const alerts: Array<{
      title: string;
      summary: string;
      urgency: "high" | "medium" | "low";
    }> = [];

    // ── Seam detection ────────────────────────────────────────────────────────

    // 1. Back-to-back anchors with no gap — flag carryover needs
    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i];
      const next = timeline[i + 1];

      const currTime = parseTime(curr.time);
      const nextTime = parseTime(next.time);
      if (currTime === null || nextTime === null) continue;

      const gapMinutes = nextTime - currTime;

      // Less than 90 minutes between events — tight transition
      if (gapMinutes < 90) {
        // Detect workout → other event (needs gear)
        const currLower = curr.title.toLowerCase();
        const nextLower = next.title.toLowerCase();
        const currIsPhysical = /gym|basketball|workout|golf|ride|run|sport|athletic/i.test(currLower);
        const nextIsNonPhysical = !/gym|basketball|workout|golf|ride|run|sport/i.test(nextLower);

        if (currIsPhysical && nextIsNonPhysical) {
          const needsChange = gapMinutes < 60;
          alerts.push({
            title: `${curr.title} → ${next.title}`,
            summary: needsChange
              ? `Back-to-back with only ${gapMinutes} min. Bring a change of clothes or adjust plans.`
              : `Physical activity before ${next.title} — bring gear to change if needed.`,
            urgency: needsChange ? "high" : "medium",
          });
        }

        // Detect back-to-back without going home (flag bag/gear needs)
        if (isWorkday && gapMinutes < 60 && currLower.includes("work")) {
          alerts.push({
            title: `Gear for ${next.title}`,
            summary: `${next.title} follows work with no break — pack anything you need this morning.`,
            urgency: "medium",
          });
        }
      }
    }

    // 2. Double-booking detection (overlapping times)
    for (let i = 0; i < timeline.length - 1; i++) {
      const curr = timeline[i];
      const next = timeline[i + 1];
      const currTime = parseTime(curr.time);
      const nextTime = parseTime(next.time);
      if (currTime === null || nextTime === null) continue;
      if (nextTime < currTime + 30) {
        // next starts within 30 min of current
        alerts.push({
          title: "Schedule conflict",
          summary: `"${curr.title}" and "${next.title}" overlap — worth checking timing.`,
          urgency: "high",
        });
      }
    }

    // 3. Energy read — 3+ high-effort things
    const heavyCount = timeline.filter((t) =>
      /dinner|restaurant|bar|club|concert|event|show|game/i.test(t.title),
    ).length;
    if (heavyCount >= 3) {
      alerts.push({
        title: "Big day",
        summary: `${heavyCount} social anchors today. Consider which ones are optional if energy runs low.`,
        urgency: "low",
      });
    }

    // 4. Geography note — 2+ events referencing the same neighborhood
    const neighborhoods = timeline
      .map((t) => extractNeighborhoodHint(t.title))
      .filter(Boolean) as string[];
    const neighborhoodCounts = new Map<string, number>();
    for (const n of neighborhoods) {
      neighborhoodCounts.set(n, (neighborhoodCounts.get(n) ?? 0) + 1);
    }
    for (const [neighborhood, count] of neighborhoodCounts) {
      if (count >= 2) {
        alerts.push({
          title: `Multiple stops near ${neighborhood}`,
          summary: `Leave the car once — ${count} stops in ${neighborhood}. Uber between them or find central parking.`,
          urgency: "low",
        });
      }
    }

    // ── Write alerts to circle_updates ────────────────────────────────────────
    for (const alert of alerts.slice(0, 4)) {
      // cap at 4 alerts per day
      const { error } = await db.from("circle_updates").insert({
        user_id: userId,
        person_id: null,
        title: alert.title,
        summary: alert.summary,
        suggested_action: null,
        urgency: alert.urgency,
        source: DAY_ORCHESTRATOR_SOURCE,
      });
      if (!error) alerts_written++;
    }
  } catch (err) {
    console.error("[dayOrchestrator] failed", err);
  }

  return { alerts_written };
}

/** Parse "7:30 PM" or "19:30" to minutes since midnight. Returns null if unparseable. */
function parseTime(timeStr: string): number | null {
  const ampm = timeStr.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    const meridiem = ampm[3].toUpperCase();
    if (meridiem === "PM" && h !== 12) h += 12;
    if (meridiem === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }
  const h24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);
  return null;
}

function extractNeighborhoodHint(title: string): string | null {
  const HOODS = [
    "West Loop",
    "River North",
    "Logan Square",
    "Wicker Park",
    "Lincoln Park",
    "Gold Coast",
    "South Loop",
    "Fulton Market",
  ];
  for (const hood of HOODS) {
    if (title.toLowerCase().includes(hood.toLowerCase())) return hood;
  }
  return null;
}
