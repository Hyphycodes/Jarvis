/**
 * POST /api/plans/[id]/build-now
 *
 * Tap-to-build endpoint for empty plan shells. It claims a short in-flight
 * marker in plans.key_stats, then fills the plan in the existing background
 * pattern so the page can poll and refresh when sections arrive.
 */

import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { fillPlan } from "@/lib/actions/plans";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const IN_FLIGHT_MS = 90_000;
const paramsSchema = z.object({ id: z.string().uuid() });

type PlanBuildRow = {
  id: string;
  user_id: string;
  build_status: string;
  updated_at: string;
  key_stats: Json;
};

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = paramsSchema.parse(await ctx.params);
    const owner = await requireOwner();
    const supabase = await getServerSupabase();

    const { data, error } = await supabase
      .from("plans")
      .select("id,user_id,build_status,updated_at,key_stats")
      .eq("id", id)
      .eq("user_id", owner.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const plan = data as PlanBuildRow;
    const { count: sectionCount } = await supabase
      .from("plan_sections")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", id)
      .eq("user_id", owner.id);
    if ((sectionCount ?? 0) > 0 || !isBuildableStatus(plan.build_status)) {
      return NextResponse.json({
        ok: true,
        build_status: plan.build_status,
        section_count: sectionCount ?? 0,
        skipped: true,
      });
    }

    const keyStats = isRecord(plan.key_stats) ? plan.key_stats : {};
    const existingStartedAt =
      typeof keyStats.tap_build_started_at === "string"
        ? keyStats.tap_build_started_at
        : null;
    if (plan.build_status === "building" && isRecent(existingStartedAt)) {
      return NextResponse.json({
        ok: true,
        build_status: "building",
        section_count: 0,
        already_running: true,
      });
    }

    const sourceItemId =
      typeof keyStats.source_item_id === "string" ? keyStats.source_item_id : null;
    if (!sourceItemId) {
      await markPlanFailed(supabase, plan, owner.id, "missing_source_item_id");
      return NextResponse.json(
        { error: "Plan is missing source item id", build_status: "failed" },
        { status: 400 },
      );
    }

    const startedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from("plans")
      .update({
        build_status: "building",
        key_stats: {
          ...keyStats,
          tap_build_started_at: startedAt,
        } as Json,
      })
      .eq("id", id)
      .eq("user_id", owner.id)
      .eq("updated_at", plan.updated_at)
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) {
      return NextResponse.json({
        ok: true,
        build_status: "building",
        section_count: 0,
        already_running: true,
      });
    }

    after(async () => {
      try {
        await fillPlan({
          planId: id,
          userId: owner.id,
          itemId: sourceItemId,
          preserveItemSurface: true,
        });
      } catch (error) {
        console.error("[plan.tap-build] fill failed", {
          planId: id,
          itemId: sourceItemId,
          error: error instanceof Error ? error.message : String(error),
        });
        const serviceSupabase = getSupabaseServiceClient();
        const fresh = await readPlanKeyStats(serviceSupabase, id, owner.id);
        await serviceSupabase
          .from("plans")
          .update({
            build_status: "failed",
            key_stats: {
              ...(isRecord(fresh) ? fresh : keyStats),
              plan_generation_error: {
                reason: "tap_build_failed",
                message: error instanceof Error ? error.message : String(error),
                failed_at: new Date().toISOString(),
              },
            } as Json,
          })
          .eq("id", id)
          .eq("user_id", owner.id);
      }
    });

    return NextResponse.json({
      ok: true,
      build_status: "building",
      section_count: 0,
      started: true,
    });
  } catch (error) {
    return handleError(error);
  }
}

async function readPlanKeyStats(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  planId: string,
  userId: string,
): Promise<Json | null> {
  const { data } = await supabase
    .from("plans")
    .select("key_stats")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  return ((data as { key_stats?: Json } | null)?.key_stats ?? null) as Json | null;
}

async function markPlanFailed(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  plan: PlanBuildRow,
  userId: string,
  reason: string,
) {
  const keyStats = isRecord(plan.key_stats) ? plan.key_stats : {};
  await supabase
    .from("plans")
    .update({
      build_status: "failed",
      key_stats: {
        ...keyStats,
        plan_generation_error: {
          reason,
          failed_at: new Date().toISOString(),
        },
      } as Json,
    })
    .eq("id", plan.id)
    .eq("user_id", userId);
}

function isBuildableStatus(status: string): boolean {
  return status === "building" || status === "failed";
}

function isRecent(value: string | null): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time < IN_FLIGHT_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function handleError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error.message.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
