import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { rowToIndexedItem } from "@/lib/index/repo";
import { evaluateActiveRadarItem } from "@/lib/intelligence/radarFrontRoom";
import type { SurfacedItemRow } from "@/lib/types/database";

const PROTECTED = new Set(["saved", "planned", "completed", "archived", "opened"]);

export type RadarCleanupResult = {
  ok: boolean;
  active_before: number;
  active_after: number;
  reviewed: number;
  archived: number;
  moved_to_holding: number;
  moved_to_discovered: number;
  deduped: number;
  preserved: number;
  invalid_active_found: number;
  reasons: string[];
};

export async function cleanupRadar(
  userId: string,
  opts: { supabase?: SupabaseClient } = {},
): Promise<RadarCleanupResult> {
  const supabase = opts.supabase ?? (await getServerSupabase());
  const { data, error } = await supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", userId)
    .eq("destination", "radar")
    .in("status", ["shown", "opened", "discovered"])
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SurfacedItemRow[];
  const activeBefore = rows.filter((row) => row.status === "shown" || row.status === "opened").length;
  const seen = new Set<string>();
  const reasons: string[] = [];
  let archived = 0;
  let movedHolding = 0;
  let movedDiscovered = 0;
  let deduped = 0;
  let preserved = 0;
  let invalidActive = 0;

  for (const row of rows) {
    if (PROTECTED.has(row.status)) {
      preserved++;
      continue;
    }

    // Age-based eviction: items shown with no engagement beyond the threshold
    // are demoted back to discovered so the board rotates.
    if (row.status === "shown") {
      const payload = row.payload as Record<string, unknown> | null;
      const shownAt = typeof payload?.shown_at === "string" ? payload.shown_at : null;
      if (shownAt) {
        const ageMs = Date.now() - new Date(shownAt).getTime();
        const isEvent =
          row.type === "event" ||
          (typeof row.starts_at === "string" && row.starts_at.length > 0);
        // Events: 4 days. Places and everything else: 7 days.
        const thresholdMs = (isEvent ? 4 : 7) * 24 * 60 * 60 * 1000;
        if (ageMs > thresholdMs) {
          const { error: staleError } = await supabase
            .from("surfaced_items")
            .update({ status: "discovered", updated_at: new Date().toISOString() })
            .eq("id", row.id)
            .eq("user_id", userId);
          if (!staleError) {
            movedDiscovered++;
            reasons.push(
              `${row.title ?? row.id}: stale — shown ${Math.floor(ageMs / 86_400_000)}d with no engagement`,
            );
          }
          continue;
        }
      }
    }

    const key = duplicateKey(row);
    const isDuplicate = seen.has(key);
    seen.add(key);
    const item = rowToIndexedItem(row);
    const gate = evaluateActiveRadarItem(item);
    const isActive = row.status === "shown" || row.status === "opened";
    if (isActive && !gate.allowed) invalidActive++;

    if (isDuplicate || gate.suggestedDestination === "archived") {
      const { error: updateError } = await supabase
        .from("surfaced_items")
        .update({ status: "archived" })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (!updateError) {
        archived++;
        if (isDuplicate) deduped++;
        reasons.push(`${row.title}: archived (${isDuplicate ? "duplicate" : gate.reason})`);
      }
      continue;
    }

    if (!gate.allowed && gate.suggestedDestination === "holding") {
      const { error: updateError } = await supabase
        .from("surfaced_items")
        .update({ destination: "holding", status: "discovered" })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (!updateError) {
        movedHolding++;
        reasons.push(`${row.title}: moved to Holding (${gate.reason})`);
      }
      continue;
    }

    if (!gate.allowed) {
      const { error: updateError } = await supabase
        .from("surfaced_items")
        .update({ status: "discovered" })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (!updateError) {
        movedDiscovered++;
        reasons.push(`${row.title}: moved to discovered (${gate.reason})`);
      }
      continue;
    }

    preserved++;
  }

  const { count } = await supabase
    .from("surfaced_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("destination", "radar")
    .in("status", ["shown", "opened"]);

  return {
    ok: true,
    active_before: activeBefore,
    active_after: count ?? 0,
    reviewed: rows.length,
    archived,
    moved_to_holding: movedHolding,
    moved_to_discovered: movedDiscovered,
    deduped,
    preserved,
    invalid_active_found: invalidActive,
    reasons: reasons.slice(0, 20),
  };
}

function duplicateKey(row: SurfacedItemRow): string {
  return [
    row.url ?? "",
    row.source_id ?? "",
    (row.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  ]
    .filter(Boolean)
    .join("|");
}
