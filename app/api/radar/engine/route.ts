/**
 * GET/POST /api/radar/engine  — the curation engine worker (per radar-curation-engine.md).
 *
 * Builds out one stage at a time. Currently runs Stage 1 (scout) for the dining
 * sub-libraries: scout wide from specialist sources, dedup by external_id, write
 * NEW candidates as status='discovered'. Later stages (enrich → pre-score →
 * finalists → council → comparative → plan → category_best → editor → bench →
 * render) and the self-chaining loop + 1-min cron backstop land here as built.
 *
 * Runs ALONGSIDE the old pipeline — it only fills the new dining_* tables; the
 * user-facing board is untouched until render cuts over.
 */

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { scoutDining } from "@/lib/radar/engine/scout";
import { preScoreDining } from "@/lib/radar/engine/prescore";
import { selectFinalistsDining } from "@/lib/radar/engine/finalists";
import { councilDining } from "@/lib/radar/engine/council";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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
  const lane = new URL(req.url).searchParams.get("lane") ?? "dining";

  try {
    const supabase = getSupabaseServiceClient();
    const startedAt = Date.now();
    // Dining lane: scout (1) → pre-score (3) → finalists (4) → council (6).
    // Light/deep enrich, comparative, plan, category_best, editor, bench + render
    // land here next.
    const scout = await scoutDining({ userId: ownerUserId, supabase });
    const prescore = await preScoreDining({ userId: ownerUserId, supabase });
    const finalists = await selectFinalistsDining({ userId: ownerUserId, supabase });
    const council = await councilDining({ userId: ownerUserId, supabase });
    const durationMs = Date.now() - startedAt;
    console.log(
      "[api/radar/engine] cycle " +
        JSON.stringify({ lane, durationMs, scout, prescore, finalists, council }),
    );
    return NextResponse.json({
      ok: true,
      lane,
      stages: ["scout", "pre_score", "finalists", "council"],
      durationMs,
      scout,
      prescore,
      finalists,
      council,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "radar/engine failed";
    console.error("[api/radar/engine] error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
