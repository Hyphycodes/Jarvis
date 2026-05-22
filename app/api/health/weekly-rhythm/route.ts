import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  DEFAULT_WEEKLY_RHYTHM,
  normalizeWeeklyRhythm,
  planWeeklyRhythmTodayRows,
} from "@/lib/schedule/weeklyRhythm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (user.role !== "owner") {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("founder_profile")
    .select("id, user_id, weekly_rhythm, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({
      ok: false,
      user: { id: user.id, email: user.email },
      error: error.message,
    }, { status: 500 });
  }

  const weeklyRhythm = normalizeWeeklyRhythm(
    data?.weekly_rhythm ?? DEFAULT_WEEKLY_RHYTHM,
  );
  const planned = planWeeklyRhythmTodayRows(weeklyRhythm);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email },
    table: "founder_profile",
    selector: { user_id: user.id },
    column: "weekly_rhythm",
    found: Boolean(data),
    updated_at: data?.updated_at ?? null,
    weekly_rhythm: weeklyRhythm,
    today_would_render_rows: planned.rows.map((row) => ({
      key: row.key,
      title: row.title,
      time: row.time,
      reason: row.reason,
    })),
    today_context: {
      weekday: planned.state.weekday,
      phase: planned.state.phase,
      minute_of_day: planned.state.minuteOfDay,
      hidden_reasons: planned.hiddenReasons,
    },
  });
}
