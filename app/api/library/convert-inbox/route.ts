/**
 * GET/POST /api/library/convert-inbox  (cron, every ~15 min)
 *
 * Drains the Candidate Inbox through the real research pipeline so every
 * category fills automatically, decoupled from the autopilot's tight 45s
 * mission budget. Per-category fairness + user-intent priority live in
 * convertCandidateInboxToLibrary; this just runs it frequently with a healthy
 * budget, then enriches the freshly-researched rows so the materializer can
 * surface them on the next promotion cycle.
 */

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { convertCandidateInboxToLibrary } from "@/lib/radar/candidateConversion";
import { enrichPending } from "@/lib/library/enrichPending";
import { createRunBudget } from "@/lib/radar/foundationSprint";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const RESEARCH_PER_RUN = 15;
const ENRICH_PER_RUN = 18;
const RUN_BUDGET_MS = 220_000;

async function validateCronSecret(req: Request): Promise<boolean> {
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
  if (!(await validateCronSecret(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const ownerUserId = await findOwnerUserId();
  if (!ownerUserId) {
    return NextResponse.json({ ok: false, error: "No owner found." }, { status: 500 });
  }

  try {
    const supabase = getSupabaseServiceClient();
    const budget = createRunBudget(RUN_BUDGET_MS);

    // 1. Research inbox candidates → real Library rows / dated events / style cards.
    const conversion = await convertCandidateInboxToLibrary({
      userId: ownerUserId,
      supabase,
      researchBudget: RESEARCH_PER_RUN,
      budget,
    });

    // 2. Fill location/hours/photo on the fresh rows + flip them to "enriched"
    //    so the materializer can surface them on the next promotion cycle.
    const enriched = budget.shouldStopSoon()
      ? { enriched: 0, scanned: 0 }
      : await enrichPending(ownerUserId, ENRICH_PER_RUN);

    return NextResponse.json({
      ok: true,
      researchedPlaces: conversion.placesCreated + conversion.placesUpdated,
      eventsQueued: conversion.eventsCreated,
      styleSurfaced: conversion.styleSurfaced,
      rejected: conversion.rejected,
      reviewed: conversion.reviewed,
      enriched: enriched.enriched,
      enrichScanned: enriched.scanned,
      timeBudgetReached: conversion.timeBudgetReached,
      errors: conversion.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "convert-inbox failed";
    console.error("[api/library/convert-inbox] error", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
