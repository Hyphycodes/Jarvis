/**
 * Day-of promotion — find items whose `starts_at` is today and expose them
 * on Today, plus mark date-passed items as expired.
 *
 * Two entry points:
 * - `findDayOfItems()` — pure read-only. Returns eligible items WITHOUT
 *   mutating anything. Safe to call from a page loader. The Today loader
 *   uses this to inject "On deck today" items into the payload.
 *
 * - `runDayOfPromotion()` — mutating. Promotes day-of items to
 *   destination="today" and marks past-dated items as expired. Called
 *   only via `POST /api/today/promote` (manual owner action). Never
 *   automatic on page load.
 */

import "server-only";

import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { rowToIndexedItem } from "@/lib/index/repo";
import type { IndexedItem } from "@/lib/index/types";
import type { SurfacedItemRow } from "@/lib/types/database";

/** Max day-of items to surface on Today. Keeps Today restrained. */
export const MAX_DAY_OF_ON_TODAY = 3;

export type DayOfFindResult = {
  /** Items that should appear on Today (already destination="today" OR eligible). */
  dayOf: IndexedItem[];
  /** Items whose starts_at is in the past — candidates for expiration. */
  pastDue: IndexedItem[];
};

export type DayOfPromoteResult = {
  promoted: number;
  expired: number;
};

// ── Read-only finder ────────────────────────────────────────────────────────

/**
 * Find items whose `starts_at` falls in the current local day.
 *
 * Pulls from saved/planned items in upcoming/holding destinations, plus
 * already-today items. PROTECTED_STATUSES (passed, archived, completed,
 * expired) are excluded.
 */
export async function findDayOfItems(
  userId: string,
): Promise<DayOfFindResult> {
  const supabase = await getServerSupabase();
  const { startIso, endIso, nowIso } = todayBounds();

  // 1. Items starting today and not yet archived/completed/passed
  const { data: dayOfData, error: dayOfError } = await supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", userId)
    .gte("starts_at", startIso)
    .lt("starts_at", endIso)
    .in("status", ["saved", "planned"])
    .in("destination", ["today", "upcoming", "radar", "holding", "plan"])
    .order("starts_at", { ascending: true })
    .limit(20);
  if (dayOfError) {
    console.error("[scheduling.dayOf] find error", dayOfError);
  }

  // 2. Items whose starts_at is already in the past (candidates for expire)
  const { data: pastData, error: pastError } = await supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", userId)
    .lt("starts_at", nowIso)
    .in("status", ["discovered", "shown", "saved", "planned", "opened"])
    .in("destination", ["upcoming", "radar", "holding", "today"])
    .order("starts_at", { ascending: false })
    .limit(20);
  if (pastError) {
    console.error("[scheduling.dayOf] past-due error", pastError);
  }

  return {
    dayOf: ((dayOfData ?? []) as SurfacedItemRow[]).map(rowToIndexedItem),
    pastDue: ((pastData ?? []) as SurfacedItemRow[]).map(rowToIndexedItem),
  };
}

// ── Mutating promotion ──────────────────────────────────────────────────────

/**
 * Promote day-of items to destination="today" and expire past-due items.
 * Used only by `POST /api/today/promote` — never from a page render.
 */
export async function runDayOfPromotion(): Promise<DayOfPromoteResult> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { dayOf, pastDue } = await findDayOfItems(owner.id);

  let promoted = 0;
  let expired = 0;

  // Day-of: items not already on Today → destination="today"
  // Skip items in protected lifecycle states (saved/planned are fine to move
  // — that's what we want). Don't touch already-today items.
  for (const item of dayOf) {
    if (item.destination === "today") continue;
    const { error } = await supabase
      .from("surfaced_items")
      .update({ destination: "today" })
      .eq("id", item.id)
      .eq("user_id", owner.id);
    if (!error) promoted++;
  }

  // Past-due: starts_at < now AND not completed → status="expired"
  // Completed items intentionally NOT touched (they already happened).
  for (const item of pastDue) {
    if (item.status === "completed") continue;
    const { error } = await supabase
      .from("surfaced_items")
      .update({ status: "expired" })
      .eq("id", item.id)
      .eq("user_id", owner.id);
    if (!error) expired++;
  }

  return { promoted, expired };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayBounds(): { startIso: string; endIso: string; nowIso: string } {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    nowIso: now.toISOString(),
  };
}
