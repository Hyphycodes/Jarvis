import { NextResponse } from "next/server";
import { processCandidates } from "@/lib/intelligence/libraryWorker";
import { getServerSupabase } from "@/lib/supabase/ssr-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function validateCronSecret(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function findOwnerUserId(): Promise<string | null> {
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from("founder_profile")
      .select("user_id")
      .limit(1)
      .maybeSingle();
    return data?.user_id ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const authorized = await validateCronSecret(req);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const ownerUserId = await findOwnerUserId();
  if (!ownerUserId) {
    return NextResponse.json(
      { ok: false, error: "No owner found." },
      { status: 500 },
    );
  }

  try {
    const result = await processCandidates(ownerUserId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worker failed";
    console.error("[api/library/process-candidates] error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
