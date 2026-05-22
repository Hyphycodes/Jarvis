/**
 * POST /api/radar/refresh
 *
 * Manual owner/debug entrypoint. The production-shaped path now delegates to
 * the ambient radar discovery runner, which keeps the old button working while
 * logging run type, budget, source quality, and fallback diagnostics.
 */

import { NextResponse } from "next/server";
import { runAmbientIntelligence } from "@/lib/intelligence/ambientRuns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { force?: unknown };
    const result = await runAmbientIntelligence({
      runType: "radar_discovery",
      force: Boolean(body.force),
    });
    return NextResponse.json({
      ...result,
      lanes_total: 0,
      lanes_aligned: 0,
      lanes_adjacent: 0,
      lanes_wildcard: 0,
      skipped_lane_ids: [],
      strategist_fallback_used: result.fallback_used,
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
