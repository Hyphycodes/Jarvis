import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { cleanupRadar } from "@/lib/intelligence/radarCleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const owner = await requireOwner();
    const result = await cleanupRadar(owner.id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Radar cleanup failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
