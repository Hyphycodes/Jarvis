import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { ingestWardrobePhotos, type WardrobeIntakeSummary } from "@/lib/wardrobe/intake";
import { sendPushNotification, hasVapid, type PushSubscriptionKeys } from "@/lib/push/send";

const BUCKET = "wardrobe-intake";

export type WardrobeImportStatus = "queued" | "processing" | "done" | "failed";

export type WardrobeImportResult = {
  created: number;
  merged: number;
  skipped: number;
  clarifications: number;
  created_item_ids: string[];
  items: WardrobeIntakeSummary["items"];
};

type ImportPhoto = { base64: string; mediaType?: string };

/**
 * Stage photos in the private `wardrobe-intake` bucket and enqueue a durable
 * import job. Returns immediately — the actual garment extraction runs in the
 * worker (kicked off via after() by the caller, with a cron backstop).
 */
export async function enqueueWardrobeImport(input: {
  userId: string;
  photos: ImportPhoto[];
  contextNote?: string;
}): Promise<{ jobId: string; photoCount: number }> {
  const supabase = getSupabaseServiceClient();
  const jobId = crypto.randomUUID();
  const photoPaths: string[] = [];

  const photos = input.photos.filter((p) => p.base64);
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const mediaType = photo.mediaType || "image/jpeg";
    const ext = mediaType.includes("png") ? "png" : mediaType.includes("webp") ? "webp" : "jpg";
    const path = `${input.userId}/${jobId}/${i}.${ext}`;
    const buffer = Buffer.from(photo.base64, "base64");
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mediaType, upsert: true });
    if (error) {
      console.error("[wardrobe.import] photo upload failed", error.message);
      continue;
    }
    photoPaths.push(path);
  }

  if (photoPaths.length === 0) {
    throw new Error("No photos could be staged for import");
  }

  const { error } = await supabase.from("wardrobe_import_jobs").insert({
    id: jobId,
    user_id: input.userId,
    status: "queued",
    context_note: input.contextNote ?? null,
    photo_paths: photoPaths,
    photo_count: photoPaths.length,
  });
  if (error) throw new Error(`enqueue wardrobe import failed: ${error.message}`);

  return { jobId, photoCount: photoPaths.length };
}

/**
 * Claim and process a single queued job. Safe to call from both the immediate
 * after() hook and the cron worker — the claim update is atomic on status, so
 * only one caller wins. Returns true if this caller processed the job.
 */
export async function processWardrobeImportJob(jobId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  const lockedBy = `worker-${crypto.randomUUID().slice(0, 8)}`;

  // Atomic claim: only succeeds if still queued.
  const { data: claimed } = await supabase
    .from("wardrobe_import_jobs")
    .update({ status: "processing", locked_at: new Date().toISOString(), locked_by: lockedBy })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, user_id, context_note, photo_paths, attempts, max_attempts")
    .maybeSingle();

  if (!claimed) return false; // someone else claimed it, or it isn't queued

  const job = claimed as {
    id: string;
    user_id: string;
    context_note: string | null;
    photo_paths: string[];
    attempts: number;
    max_attempts: number;
  };

  try {
    const photos: ImportPhoto[] = [];
    for (const path of job.photo_paths ?? []) {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error || !data) {
        console.error("[wardrobe.import] download failed", path, error?.message);
        continue;
      }
      const base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
      photos.push({ base64, mediaType: data.type || "image/jpeg" });
    }

    if (photos.length === 0) throw new Error("No photos could be downloaded for processing");

    const summary = await ingestWardrobePhotos({
      userId: job.user_id,
      photos,
      contextNote: job.context_note ?? undefined,
    });

    const result: WardrobeImportResult = {
      created: summary.created,
      merged: summary.merged,
      skipped: summary.skipped,
      clarifications: summary.clarifications,
      created_item_ids: summary.items.filter((it) => !it.merged).map((it) => it.id),
      items: summary.items,
    };
    const summaryText = buildWardrobeSummaryText(summary);

    await supabase
      .from("wardrobe_import_jobs")
      .update({ status: "done", result, summary_text: summaryText, error_message: null })
      .eq("id", job.id);

    // Best-effort cleanup of staged photos.
    if (job.photo_paths?.length) {
      await supabase.storage.from(BUCKET).remove(job.photo_paths).catch(() => {});
    }

    await sendWardrobeDonePush(job.user_id, summaryText).catch(() => {});
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = (job.attempts ?? 0) + 1;
    const giveUp = attempts >= (job.max_attempts ?? 3);
    await supabase
      .from("wardrobe_import_jobs")
      .update({
        status: giveUp ? "failed" : "queued",
        attempts,
        error_message: message,
        locked_at: null,
        locked_by: null,
      })
      .eq("id", job.id);
    console.error("[wardrobe.import] job failed", { jobId: job.id, attempts, message });
    return false;
  }
}

/** Drain queued jobs (cron backstop). Processes oldest-first up to `limit`. */
export async function drainWardrobeImportQueue(limit = 5): Promise<{ processed: number }> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("wardrobe_import_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  let processed = 0;
  for (const id of ids) {
    const ok = await processWardrobeImportJob(id);
    if (ok) processed++;
  }
  return { processed };
}

/** Simple, owner-facing completion line. Never a full report. */
export function buildWardrobeSummaryText(summary: WardrobeIntakeSummary): string {
  if (summary.created === 0 && summary.merged === 0) {
    return "Couldn't find clear pieces in those photos.";
  }
  const piece = (n: number) => `${n} ${n === 1 ? "piece" : "pieces"}`;
  let base =
    summary.created > 0
      ? `Added ${piece(summary.created)} to your closet.`
      : "No new pieces — already had those on file.";

  const extras: string[] = [];
  if (summary.created > 0 && summary.merged > 0) {
    extras.push(`merged ${summary.merged} ${summary.merged === 1 ? "repeat" : "repeats"}`);
  }
  if (summary.clarifications > 0) {
    extras.push(`${summary.clarifications} need confirmation`);
  }
  if (extras.length > 0) base += ` ${capitalize(extras.join(", "))}.`;
  return base;
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

async function sendWardrobeDonePush(userId: string, body: string): Promise<void> {
  if (!hasVapid()) return;
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId);
  const subs = (data ?? []) as PushSubscriptionKeys[];
  if (!subs.length) return;
  await Promise.allSettled(
    subs.map((sub) =>
      sendPushNotification(sub, { title: "Closet updated", body, url: "/wardrobe" }),
    ),
  );
}
