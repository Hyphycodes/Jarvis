import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import {
  setAutopilotEnabled,
  setFoundationSprintEnabled,
} from "@/lib/radar/autopilotRuns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.foundationSprint === true) {
      const settings = await setFoundationSprintEnabled({
        userId: owner.id,
        enabled: false,
        reason: typeof body.reason === "string" ? body.reason : "owner_requested",
      });
      return NextResponse.json({ ok: true, status: "foundation_sprint_paused", settings });
    }
    const settings = await setAutopilotEnabled({
      userId: owner.id,
      enabled: false,
      reason: typeof body.reason === "string" ? body.reason : "owner_requested",
    });
    return NextResponse.json({ ok: true, status: "paused", settings });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
}
