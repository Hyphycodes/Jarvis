import { NextResponse } from "next/server";
import { checkEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const result = checkEnv();
  return NextResponse.json(
    {
      status: result.ok ? "ok" : "missing_env",
      env_loaded: result.ok,
      missing: result.missing,
      timestamp: new Date().toISOString(),
    },
    { status: result.ok ? 200 : 500 },
  );
}
