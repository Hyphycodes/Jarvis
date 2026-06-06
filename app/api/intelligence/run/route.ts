import { NextResponse } from "next/server";
import { runAmbientIntelligence } from "@/lib/intelligence/ambientRuns";
import { parseAmbientRunType } from "@/lib/intelligence/runTypes";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function validateCronSecret(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function findOwnerUserId(): Promise<string | null> {
  try {
    const supabase = getSupabaseServiceClient();
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

  const url = new URL(req.url);
  const runType = parseAmbientRunType(url.searchParams.get("run_type") ?? "");
  if (!runType) {
    return NextResponse.json(
      { ok: false, error: "Unknown intelligence run type." },
      { status: 400 },
    );
  }

  const ownerUserId = await findOwnerUserId();
  if (!ownerUserId) {
    return NextResponse.json({ ok: false, error: "Owner not found." }, { status: 500 });
  }

  try {
    const result = await runAmbientIntelligence({ runType, ownerUserId });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Intelligence run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authorized = await validateCronSecret(req);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const runType = parseAmbientRunType(body.run_type);
    if (!runType) {
      return NextResponse.json(
        { ok: false, error: "Unknown intelligence run type." },
        { status: 400 },
      );
    }

    const ownerUserId = await findOwnerUserId();
    if (!ownerUserId) {
      return NextResponse.json({ ok: false, error: "Owner not found." }, { status: 500 });
    }

    const result = await runAmbientIntelligence({
      runType,
      force: Boolean(body.force),
      testMode: Boolean(body.test_mode),
      ownerUserId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Intelligence run failed";
    const status = /login|owner|auth/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
