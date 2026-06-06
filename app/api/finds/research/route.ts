import { after, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { enqueueFindResearch, processFindResearchJob } from "@/lib/finds/researchJobs";
import type { FindSource } from "@/lib/finds/finds";
import type { SourceBrain } from "@/lib/brain/productResearcher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Enqueue a durable product-research job. Returns instantly with a jobId. */
export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const body = (await req.json().catch(() => ({}))) as {
      mission?: string;
      context?: string;
      source?: FindSource;
      source_brain?: SourceBrain;
      refine?: string;
      item_id?: string;
    };

    const mission = typeof body.mission === "string" ? body.mission.trim() : "";
    if (!mission && !body.item_id) {
      return NextResponse.json({ ok: false, error: "mission or item_id required" }, { status: 400 });
    }

    const { jobId } = await enqueueFindResearch({
      userId: owner.id,
      mission: mission || "Refine find",
      context: typeof body.context === "string" ? body.context : undefined,
      source: body.source,
      sourceBrain: body.source_brain,
      refine: typeof body.refine === "string" ? body.refine : undefined,
      itemId: typeof body.item_id === "string" ? body.item_id : undefined,
    });

    // Start immediately; the cron is only a durability backstop.
    after(() =>
      processFindResearchJob(jobId).catch((err) =>
        console.error("[api/finds/research] background process failed", err),
      ),
    );

    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research enqueue failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Poll a research job's status/summary. */
export async function GET(req: Request) {
  try {
    const owner = await requireOwner();
    const jobId = new URL(req.url).searchParams.get("job_id");
    if (!jobId) return NextResponse.json({ ok: false, error: "job_id required" }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data } = await supabase
      .from("finds_research_jobs")
      .select("status, summary_text, item_id, result")
      .eq("id", jobId)
      .eq("user_id", owner.id)
      .maybeSingle();

    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const job = data as { status: string; summary_text: string | null; item_id: string | null; result: unknown };
    return NextResponse.json({
      ok: true,
      status: job.status,
      summary_text: job.summary_text,
      item_id: job.item_id,
      result: job.result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status lookup failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
