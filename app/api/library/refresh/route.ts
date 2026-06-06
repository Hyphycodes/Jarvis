import { NextResponse } from "next/server";
import { processRefresh } from "@/lib/brain/refresher";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function validateCronSecret(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  const authorized = await validateCronSecret(req);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const result = await processRefresh(5, supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    console.error("[api/library/refresh] error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authorized = await validateCronSecret(req);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const result = await processRefresh(5, supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed";
    console.error("[api/library/refresh] error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
