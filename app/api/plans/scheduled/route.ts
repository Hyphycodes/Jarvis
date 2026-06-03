/**
 * GET /api/plans/scheduled
 *
 * Phase 9: scheduled plans for the in-app calendar (Today tab).
 */

import { NextResponse } from "next/server";
import { loadScheduledPlans } from "@/lib/plans/loadScheduled";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const plans = await loadScheduledPlans();
    return NextResponse.json({ ok: true, plans });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
