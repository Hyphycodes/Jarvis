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
import { enrichDining } from "@/lib/radar/engine/enrich";
import { councilDining } from "@/lib/radar/engine/council";
import { comparativeDining } from "@/lib/radar/engine/comparative";
import { editorAssembleLane } from "@/lib/radar/engine/editor";
import { benchDining } from "@/lib/radar/engine/bench";
import { runEventsEngine } from "@/lib/radar/engine/events";
import { runCultureEngine } from "@/lib/radar/engine/culture";
import { runPlacesEngine } from "@/lib/radar/engine/places";
import { runMovesEngine } from "@/lib/radar/engine/moves";

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

  // Events lane engine — reuses the scout + verifier + current_events warehouse
  // (per radar-lane-engine-replication.md). Distinct flow from dining's stages.
  if (lane === "events") {
    try {
      const startedAt = Date.now();
      const events = await runEventsEngine({ userId: ownerUserId });
      const durationMs = Date.now() - startedAt;
      console.log("[api/radar/engine] events cycle " + JSON.stringify({ durationMs, events }));
      return NextResponse.json({ ok: true, lane, durationMs, events });
    } catch (err) {
      const message = err instanceof Error ? err.message : "radar/engine events failed";
      console.error("[api/radar/engine] events error", err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  // Culture lane engine — warehouse culture_items; mostly timeless (per
  // jarvis-culture-engine-brain-tree.md).
  if (lane === "culture") {
    try {
      const startedAt = Date.now();
      const culture = await runCultureEngine({ userId: ownerUserId });
      const durationMs = Date.now() - startedAt;
      console.log("[api/radar/engine] culture cycle " + JSON.stringify({ durationMs, culture }));
      return NextResponse.json({ ok: true, lane, durationMs, culture });
    } catch (err) {
      const message = err instanceof Error ? err.message : "radar/engine culture failed";
      console.error("[api/radar/engine] culture error", err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  // Places lane engine — warehouse places_items (seeded from places_library);
  // evergreen + Role brain (per jarvis-places-engine-brain-tree.md).
  if (lane === "places") {
    try {
      const startedAt = Date.now();
      const places = await runPlacesEngine({ userId: ownerUserId });
      const durationMs = Date.now() - startedAt;
      console.log("[api/radar/engine] places cycle " + JSON.stringify({ durationMs, places }));
      return NextResponse.json({ ok: true, lane, durationMs, places });
    } catch (err) {
      const message = err instanceof Error ? err.message : "radar/engine places failed";
      console.error("[api/radar/engine] places error", err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  // Moves lane engine — generated executable actions; evergreen + Energy/Weather
  // brains (per jarvis-moves-engine-brain-tree.md).
  if (lane === "moves") {
    try {
      const startedAt = Date.now();
      const moves = await runMovesEngine({ userId: ownerUserId });
      const durationMs = Date.now() - startedAt;
      console.log("[api/radar/engine] moves cycle " + JSON.stringify({ durationMs, moves }));
      return NextResponse.json({ ok: true, lane, durationMs, moves });
    } catch (err) {
      const message = err instanceof Error ? err.message : "radar/engine moves failed";
      console.error("[api/radar/engine] moves error", err);
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  try {
    const supabase = getSupabaseServiceClient();
    const startedAt = Date.now();
    // Dining lane: scout (1) → pre-score (3) → finalists (4) → council (6).
    // Light/deep enrich, comparative, plan, category_best, editor, bench + render
    // land here next.
    const scout = await scoutDining({ userId: ownerUserId, supabase });
    const prescore = await preScoreDining({ userId: ownerUserId, supabase });
    const finalists = await selectFinalistsDining({ userId: ownerUserId, supabase });
    const enrich = await enrichDining({ userId: ownerUserId, supabase });
    const council = await councilDining({ userId: ownerUserId, supabase });
    const comparative = await comparativeDining({ userId: ownerUserId, supabase });
    const editor = await editorAssembleLane({ userId: ownerUserId, lane: "dining", supabase });
    const bench = await benchDining({ userId: ownerUserId, supabase });
    // Staging → plan-build → show is handled by the readiness-gated /api/radar/plans
    // cron, so a card only reaches the board once its plan is complete.
    const durationMs = Date.now() - startedAt;
    console.log(
      "[api/radar/engine] cycle " +
        JSON.stringify({ lane, durationMs, scout, prescore, finalists, enrich, council, comparative, editor, bench }),
    );
    return NextResponse.json({
      ok: true,
      lane,
      stages: ["scout", "pre_score", "finalists", "enrich", "council", "comparative", "editor", "bench"],
      durationMs,
      scout,
      prescore,
      finalists,
      enrich,
      council,
      comparative,
      editor,
      bench,
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
