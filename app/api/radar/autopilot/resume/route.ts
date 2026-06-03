import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { setAutopilotEnabled } from "@/lib/radar/autopilotRuns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const owner = await requireOwner();
    const settings = await setAutopilotEnabled({
      userId: owner.id,
      enabled: true,
    });
    return NextResponse.json({ ok: true, status: "enabled", settings });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }
}
