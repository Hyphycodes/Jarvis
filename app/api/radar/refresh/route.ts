/**
 * POST /api/radar/refresh
 *
 * Manual owner/debug entrypoint. The production-shaped path now delegates to
 * the ambient radar discovery runner, which keeps the old button working while
 * logging run type, budget, source quality, and fallback diagnostics.
 */

import { NextResponse } from "next/server";
import { refillRadarBoard } from "@/lib/intelligence/radarRefill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { force?: unknown };
    const result = await refillRadarBoard({
      trigger: "manual_refresh",
      force: Boolean(body.force),
      maxAttempts: 2,
    });
    const lastRun = result.runs.at(-1);
    return NextResponse.json({
      ...result,
      candidates_found: result.runs.reduce((sum, run) => sum + run.candidates_found, 0),
      inserted: result.runs.reduce((sum, run) => sum + run.inserted, 0),
      updated: result.runs.reduce((sum, run) => sum + run.updated, 0),
      shortlisted: result.runs.reduce((sum, run) => sum + run.shortlisted, 0),
      selected: result.runs.reduce((sum, run) => sum + run.selected, 0),
      rejected: result.runs.reduce((sum, run) => sum + run.rejected, 0),
      expired: result.runs.reduce((sum, run) => sum + run.expired, 0),
      run_type: "radar_refill",
      decision_run_id: lastRun?.decision_run_id ?? null,
      errors: result.runs.flatMap((run) => run.errors),
      fallback_used: result.runs.some((run) => run.fallback_used),
      fallback_reason: lastRun?.fallback_reason,
      lanes_total: 0,
      lanes_aligned: 0,
      lanes_adjacent: 0,
      lanes_wildcard: 0,
      skipped_lane_ids: [],
      strategist_fallback_used: result.runs.some((run) => run.fallback_used),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHENTICATED") {
        return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
      }
      if (error.message.startsWith("FORBIDDEN")) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
