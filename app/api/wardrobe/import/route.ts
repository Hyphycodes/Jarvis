import { after, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { enqueueWardrobeImport, processWardrobeImportJob } from "@/lib/wardrobe/importJobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type IncomingImage = {
  base64?: string;
  image_base64?: string;
  media_type?: string;
  image_media_type?: string;
};

/** Enqueue a durable closet-import job from staged photos. Returns instantly. */
export async function POST(req: Request) {
  try {
    const owner = await requireOwner();
    const body = (await req.json().catch(() => ({}))) as {
      images?: IncomingImage[];
      image_base64?: string;
      image_media_type?: string;
      context?: string;
    };

    const raw: IncomingImage[] = Array.isArray(body.images) && body.images.length
      ? body.images
      : body.image_base64
        ? [{ image_base64: body.image_base64, image_media_type: body.image_media_type }]
        : [];

    const photos = raw
      .map((img) => ({
        base64: (img.base64 ?? img.image_base64 ?? "") as string,
        mediaType: (img.media_type ?? img.image_media_type ?? "image/jpeg") as string,
      }))
      .filter((p) => p.base64);

    if (photos.length === 0) {
      return NextResponse.json({ ok: false, error: "No images" }, { status: 400 });
    }

    const { jobId, photoCount } = await enqueueWardrobeImport({
      userId: owner.id,
      photos,
      contextNote: typeof body.context === "string" ? body.context : undefined,
    });

    // Start processing right away; the cron is only a durability backstop.
    after(() =>
      processWardrobeImportJob(jobId).catch((err) =>
        console.error("[api/wardrobe/import] background process failed", err),
      ),
    );

    return NextResponse.json({ ok: true, jobId, photoCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import enqueue failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Poll a job's status/summary for the chat completion message. */
export async function GET(req: Request) {
  try {
    const owner = await requireOwner();
    const jobId = new URL(req.url).searchParams.get("job_id");
    if (!jobId) return NextResponse.json({ ok: false, error: "job_id required" }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data } = await supabase
      .from("wardrobe_import_jobs")
      .select("status, summary_text, result")
      .eq("id", jobId)
      .eq("user_id", owner.id)
      .maybeSingle();

    if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    const job = data as { status: string; summary_text: string | null; result: unknown };
    return NextResponse.json({
      ok: true,
      status: job.status,
      summary_text: job.summary_text,
      result: job.result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status lookup failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
