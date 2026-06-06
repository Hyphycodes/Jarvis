/**
 * GET/POST /api/finds/scout — Need Scout (cron, a few times a day).
 * Scans context + closet gaps and surfaces 5-7 quiet, useful Finds.
 */
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { runNeedScout } from "@/lib/brain/needScout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function validateCronSecret(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function findOwnerUserId(): Promise<string | null> {
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase.from("founder_profile").select("user_id").limit(1).maybeSingle();
    return data?.user_id ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (!(await validateCronSecret(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const ownerUserId = await findOwnerUserId();
  if (!ownerUserId) return NextResponse.json({ ok: false, error: "No owner found." }, { status: 500 });
  try {
    const result = await runNeedScout({ userId: ownerUserId, limit: 7 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Need Scout failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
