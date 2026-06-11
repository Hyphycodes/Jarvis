/**
 * GET/POST /api/radar/plans  (cron, every ~5 min)
 *
 * The readiness gate for engine lanes: a card only reaches Radar (status=shown)
 * once its plan is complete. Each run:
 *   1. stage  — mirror the top bench pool into surfaced_items at 'discovered'
 *               (not visible; this is where the plan-builder finds them).
 *   2. build  — build plans for discovered (+shown) radar items. Heavy (Google +
 *               LLM + photo), so a small batch keeps each run under maxDuration.
 *   3. show   — flip ONLY plan-complete items to 'shown' (top-N, diversity).
 *
 * Isolated from the promote worker, where plan-building ran last and starved on a
 * budget the materialize/promote loops had already spent (engine cards reached
 * 'shown' with no plan). Now plans build reliably and dynamically.
 */

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { preBuildPlansForShownItems } from "@/lib/radar/planPreBuilder";
import { stageBenchToDiscovered, promotePlanReadyToShown } from "@/lib/radar/engine/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Lanes the curation engine owns (readiness-gated). Grows as lanes cut over. */
const ENGINE_LANES = ["dining"];
// With the vision photo-pick skipped for items that already have a hero image
// (engine cards do), each build is ~halved, so a batch of 6 stays well under the
// 300s function limit. Bump the cron frequency too if a faster fill is wanted.
const PLANS_PER_RUN = 6;

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
    const startedAt = Date.now();

    // 1. Stage each engine lane's bench pool as 'discovered'.
    const staged = [];
    for (const lane of ENGINE_LANES) {
      staged.push(await stageBenchToDiscovered({ userId: ownerUserId, lane, supabase }));
    }

    // 2. Build plans for discovered (+shown) radar items — engine cards get
    //    planned BEFORE they're shown; old-pipeline shown items get plans too.
    const pb = await preBuildPlansForShownItems(ownerUserId, supabase, {
      maxItems: PLANS_PER_RUN,
      statuses: ["discovered", "shown"],
      orderBy: "score",
    });

    // 2b. Committed items (saved tonight events, voiced occasions on today/
    //     upcoming) get plans built FOR him too — never a "Plan it" ask.
    const pbCommitted = await preBuildPlansForShownItems(ownerUserId, supabase, {
      maxItems: 2,
      statuses: ["saved", "planned"],
      destinations: ["today", "upcoming"],
      orderBy: "updated_at",
    });

    // 3. Show ONLY plan-complete engine items (top-N, diversity).
    const shown = [];
    for (const lane of ENGINE_LANES) {
      shown.push(await promotePlanReadyToShown({ userId: ownerUserId, lane, supabase }));
    }

    const durationMs = Date.now() - startedAt;
    const plansBuilt = pb.built + pbCommitted.built;
    const errors = [...pb.errors, ...pbCommitted.errors];
    console.log(
      "[api/radar/plans] run " +
        JSON.stringify({ durationMs, staged, plansBuilt, shown, errors: errors.slice(0, 5) }),
    );
    return NextResponse.json({ ok: true, durationMs, staged, plansBuilt, shown, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "radar/plans failed";
    console.error("[api/radar/plans] error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
