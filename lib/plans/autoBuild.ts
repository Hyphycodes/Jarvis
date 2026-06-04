import "server-only";

import { generatePlanForItem } from "@/lib/actions/plans";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { Json, SurfacedItemRow } from "@/lib/types/database";

const SWEEP_LIMIT = 10;
const BUILD_CAP = 3;
const inFlightUsers = new Set<string>();

export type PlanAutoBuildSummary = {
  ok: true;
  scanned: number;
  attempted: number;
  built: number;
  skipped: number;
  errors: string[];
  alreadyRunning?: boolean;
};

export async function triggerPlanBuildsForNewRadarItems(
  userId: string,
): Promise<PlanAutoBuildSummary> {
  if (inFlightUsers.has(userId)) {
    return {
      ok: true,
      scanned: 0,
      attempted: 0,
      built: 0,
      skipped: 0,
      errors: [],
      alreadyRunning: true,
    };
  }

  inFlightUsers.add(userId);
  try {
    return await runPlanAutoBuildSweep(userId);
  } finally {
    inFlightUsers.delete(userId);
  }
}

async function runPlanAutoBuildSweep(userId: string): Promise<PlanAutoBuildSummary> {
  const supabase = getSupabaseServiceClient();
  const summary: PlanAutoBuildSummary = {
    ok: true,
    scanned: 0,
    attempted: 0,
    built: 0,
    skipped: 0,
    errors: [],
  };

  const { data, error } = await supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", userId)
    .eq("destination", "radar")
    .in("status", ["shown", "opened"])
    .order("updated_at", { ascending: false })
    .limit(SWEEP_LIMIT);

  if (error) {
    summary.errors.push(error.message);
    return summary;
  }

  const rows = (data ?? []) as SurfacedItemRow[];
  summary.scanned = rows.length;
  const candidates = rows
    .filter((row) => !readPlanSlug(row.payload))
    .slice(0, BUILD_CAP);
  summary.skipped = rows.length - candidates.length;

  for (const row of candidates) {
    summary.attempted++;
    try {
      await generatePlanForItem({
        itemId: row.id,
        userId,
        force: false,
        recordSignal: false,
        preserveItemSurface: true,
      });
      summary.built++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(`${row.id}: ${message}`);
      console.error("[plans.autoBuild] plan build failed", {
        itemId: row.id,
        title: row.title,
        error,
      });
    }
  }

  return summary;
}

function readPlanSlug(payload: Json): string | undefined {
  if (!isRecord(payload)) return undefined;
  return typeof payload.plan_slug === "string" ? payload.plan_slug : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
