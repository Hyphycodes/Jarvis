import { NextResponse } from "next/server";
import { runAmbientIntelligence } from "@/lib/intelligence/ambientRuns";
import { parseAmbientRunType } from "@/lib/intelligence/runTypes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const runType = parseAmbientRunType(body.run_type);
    if (!runType) {
      return NextResponse.json(
        { ok: false, error: "Unknown intelligence run type." },
        { status: 400 },
      );
    }
    const result = await runAmbientIntelligence({
      runType,
      force: Boolean(body.force),
      testMode: Boolean(body.test_mode),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Intelligence run failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
