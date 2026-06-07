/**
 * GET/POST /api/radar/promote  (cron, every ~5 min)
 *
 * The dedicated, fast promotion worker. Promotion ONLY — no web gather, no
 * provider calls — so it never competes with the discovery cron's tight budget.
 *
 * Two budget-bounded loops:
 *   1. Drain Library → surfaced "discovered" via materializeEligibleLibraryItems.
 *      Decoupled from the autopilot's 16-per-call cap so the deep ready pool
 *      (100+ enriched A/B places) actually reaches the surface table.
 *   2. Fill "discovered" → "shown" via promoteHoldingWithService, which runs the
 *      living-7-per-category engine (open slots first, displace weaker sitters).
 *
 * Net effect: a deep discovered pool behind the scenes, the best 7 per category
 * shown. Runs frequently and cheaply; the visible board fills within a cycle.
 */

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { materializeEligibleLibraryItems } from "@/lib/radar/libraryMaterializer";
import { promoteHoldingWithService } from "@/lib/radar/autopilot";
import { preBuildPlansForShownItems } from "@/lib/radar/planPreBuilder";
import { createRunBudget } from "@/lib/radar/foundationSprint";
import { RADAR_PROMOTIONS_PER_RUN } from "@/lib/brain/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const RUN_BUDGET_MS = 220_000;
const MATERIALIZE_BATCH = 16;
const MAX_MATERIALIZE_ITERATIONS = 12; // up to ~192 inserts/run — drains the ready pool
const MAX_PROMOTE_ITERATIONS = 6; // up to ~60 board changes/run — fills 6×7 with headroom
const PLAN_PREBUILD_PER_RUN = 6;

function validateCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
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
  if (!validateCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const ownerUserId = await findOwnerUserId();
  if (!ownerUserId) {
    return NextResponse.json({ ok: false, error: "No owner found." }, { status: 500 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const budget = createRunBudget(RUN_BUDGET_MS);
    const errors: string[] = [];

    // 1. Drain Library → surfaced "discovered" until the ready pool is empty.
    let materialized = 0;
    for (let i = 0; i < MAX_MATERIALIZE_ITERATIONS; i++) {
      if (budget.shouldStopSoon()) break;
      const res = await materializeEligibleLibraryItems(ownerUserId, {
        maxInsertions: MATERIALIZE_BATCH,
      });
      materialized += res.materialized;
      if (res.errors.length) errors.push(...res.errors);
      if (res.materialized === 0) break; // pool drained
    }

    // 2. Fill "discovered" → "shown" (living-7 per category) until no more qualify.
    let promoted = 0;
    let reviewed = 0;
    for (let i = 0; i < MAX_PROMOTE_ITERATIONS; i++) {
      if (budget.shouldStopSoon()) break;
      const res = await promoteHoldingWithService({
        userId: ownerUserId,
        supabase,
        slots: RADAR_PROMOTIONS_PER_RUN,
      });
      promoted += res.promoted;
      reviewed += res.reviewed;
      if (res.promoted === 0) break; // board full or nothing eligible
    }

    // 3. Pre-build plans for newly-shown items so they open instantly (bounded).
    let plansBuilt = 0;
    if (!budget.shouldStopSoon()) {
      const pb = await preBuildPlansForShownItems(ownerUserId, supabase, {
        maxItems: PLAN_PREBUILD_PER_RUN,
      });
      plansBuilt = pb.built;
      if (pb.errors.length) errors.push(...pb.errors);
    }

    return NextResponse.json({
      ok: true,
      materialized,
      promoted,
      reviewed,
      plansBuilt,
      timeBudgetReached: budget.shouldStopSoon(),
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "radar/promote failed";
    console.error("[api/radar/promote] error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
