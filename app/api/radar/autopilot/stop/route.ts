import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { requestAutopilotStop } from "@/lib/radar/autopilotRuns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const settings = await requestAutopilotStop({
      userId: owner.id,
      runId: typeof body.runId === "string" ? body.runId : null,
    });
    return NextResponse.json({
      ok: true,
      status: "stop_requested",
      summary: "Stop requested. Autopilot will stop after the current step.",
      settings,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
}
