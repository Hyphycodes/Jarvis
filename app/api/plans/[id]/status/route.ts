/**
 * GET /api/plans/[id]/status
 *
 * Phase 9: lightweight build-status poll for the "Plan building…" bar.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = paramsSchema.parse(await ctx.params);
    const { id: userId } = await getViewableProfileId();
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from("plans")
      .select("build_status,status,key_stats")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const row = data as {
      build_status: string;
      status: string;
      key_stats?: unknown;
    };
    const { count: sectionCount } = await supabase
      .from("plan_sections")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", id)
      .eq("user_id", userId);
    return NextResponse.json({
      ok: true,
      build_status: row.build_status,
      status: row.status,
      section_count: sectionCount ?? 0,
      plan_generation_error: readPlanGenerationError(row.key_stats),
    });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

function readPlanGenerationError(keyStats: unknown): unknown {
  if (!isRecord(keyStats)) return null;
  return isRecord(keyStats.plan_generation_error)
    ? keyStats.plan_generation_error
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
