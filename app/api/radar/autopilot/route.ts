import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { runRadarAutopilot } from "@/lib/radar/autopilot";
import {
  normalizeAutopilotMode,
  setFoundationSprintEnabled,
} from "@/lib/radar/autopilotRuns";
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
  const mode = normalizeAutopilotMode(url.searchParams.get("mode"));
  const ownerUserId = await findOwnerUserId();
  if (!ownerUserId) {
    return NextResponse.json({ ok: false, error: "Owner not found." }, { status: 500 });
  }
  const result = await runRadarAutopilot({
    userId: ownerUserId,
    mode,
    force: mode === "bootstrap",
  });
  return NextResponse.json(toAutopilotResponse(mode, result));
}

export async function POST(req: Request) {
  let ownerUserId: string | null = null;
  if (validateCronSecret(req)) {
    ownerUserId = await findOwnerUserId();
  } else {
    try {
      ownerUserId = (await requireOwner()).id;
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHENTICATED") {
        return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
      }
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }
  }
  if (!ownerUserId) return NextResponse.json({ ok: false, error: "Owner not found." }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = normalizeAutopilotMode(
    typeof body.mode === "string" ? body.mode : body.force ? "manual_force" : "owner_requested",
  );
  if (mode === "foundation_sprint" && (body.start === true || body.resume === true)) {
    await setFoundationSprintEnabled({
      userId: ownerUserId,
      enabled: true,
      reason: typeof body.reason === "string" ? body.reason : "owner_requested",
      resetCursor: body.start === true,
      supabase: getSupabaseServiceClient(),
    });
  }
  const result = await runRadarAutopilot({
    userId: ownerUserId,
    mode,
    force: Boolean(body.force) || mode === "bootstrap" || Boolean(body.runNow),
  });
  return NextResponse.json(toAutopilotResponse(mode, result));
}

function toAutopilotResponse(mode: string, result: Awaited<ReturnType<typeof runRadarAutopilot>>) {
  return {
    ok: true,
    mode,
    operation: result.operation,
    bootstrap_needed: result.bootstrapNeeded ?? false,
    operations_run: result.operationsRun ?? [result.operation],
    provider_status: result.providerStatus ?? {},
    missing_providers: result.missingProviders ?? [],
    counts_before: {
      active: result.activeCount,
      holding: result.holdingCount,
      candidateInbox: result.candidateInboxCount ?? 0,
      library: result.libraryBefore ?? result.libraryCounts ?? {},
    },
    counts_after: {
      active: result.activeAfter ?? result.activeCount,
      holding: result.holdingAfter ?? result.holdingCount,
      candidateInbox: result.candidateInboxAfter ?? result.candidateInboxCount ?? 0,
      library: result.libraryAfter ?? result.libraryCounts ?? {},
    },
    candidates_created: result.candidatesDiscovered,
    library_items_created: result.libraryItemsCreated,
    sources_created: result.sourcesCreated,
    candidates_promoted: result.candidatesPromoted,
    candidates_held: result.candidatesHeld,
    summary: result.summary,
    current_mission: result.currentMission ?? null,
    next_mission: result.nextMission ?? null,
    events_created: result.eventsCreated ?? 0,
    run_id: result.runId ?? null,
    run_status: result.runStatus ?? null,
    raw: result,
  };
}
