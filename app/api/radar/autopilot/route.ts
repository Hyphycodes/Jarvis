import { NextResponse } from "next/server";
import { runRadarAutopilot } from "@/lib/radar/autopilot";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function validateCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function findOwnerUserId(): Promise<string | null> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("founder_profile")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

export async function GET(req: Request) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "bootstrap" ? "bootstrap" : "cron";
  const ownerUserId = await findOwnerUserId();
  if (!ownerUserId) {
    return NextResponse.json({ ok: false, error: "Owner not found." }, { status: 500 });
  }
  const result = await runRadarAutopilot({
    userId: ownerUserId,
    mode,
    force: mode === "bootstrap",
  });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const ownerUserId = await findOwnerUserId();
  if (!ownerUserId) {
    return NextResponse.json({ ok: false, error: "Owner not found." }, { status: 500 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = body.mode === "bootstrap"
    ? "bootstrap"
    : body.force
      ? "manual_force"
      : "owner_requested";
  const result = await runRadarAutopilot({
    userId: ownerUserId,
    mode,
    force: Boolean(body.force) || mode === "bootstrap",
  });
  return NextResponse.json({ ok: true, ...result });
}
