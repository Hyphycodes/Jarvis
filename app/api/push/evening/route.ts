import { NextResponse } from "next/server";
import { runEveningBriefPush } from "@/lib/intelligence/ambientRuns";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function validateCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getSupabaseServiceClient();

    // Distinct users with at least one active subscription.
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("user_id");
    if (error) throw new Error(error.message);

    const userIds = Array.from(
      new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)),
    );

    const results = [];
    let totalSent = 0;
    for (const userId of userIds) {
      const summary = await runEveningBriefPush(userId);
      results.push(summary);
      totalSent += summary.sent;
    }

    return NextResponse.json({
      ok: true,
      users: userIds.length,
      sent: totalSent,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evening push failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
