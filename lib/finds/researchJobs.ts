import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { createFind, refineFind, type FindSource } from "@/lib/finds/finds";
import { classifyBrain, findIsReady, type SourceBrain } from "@/lib/brain/productResearcher";
import { sendPushNotification, hasVapid, type PushSubscriptionKeys } from "@/lib/push/send";

export type FindsJobStatus = "queued" | "processing" | "done" | "failed";

type FindsJobRow = {
  id: string;
  user_id: string;
  mission: string;
  context: string | null;
  source: FindSource;
  source_brain: SourceBrain | null;
  refine: string | null;
  item_id: string | null;
  attempts: number;
  max_attempts: number;
};

/**
 * Enqueue a durable product-research job. Returns immediately — the Product
 * Researcher run happens in the worker (kicked off via after() by the caller,
 * with a cron backstop). For refinements, pass an existing `itemId` + `refine`.
 */
export async function enqueueFindResearch(input: {
  userId: string;
  mission: string;
  context?: string;
  source?: FindSource;
  sourceBrain?: SourceBrain;
  refine?: string;
  itemId?: string;
}): Promise<{ jobId: string }> {
  const supabase = getSupabaseServiceClient();
  const jobId = crypto.randomUUID();
  const brain = input.sourceBrain ?? classifyBrain(input.mission, input.context);

  const { error } = await supabase.from("finds_research_jobs").insert({
    id: jobId,
    user_id: input.userId,
    status: "queued",
    mission: input.mission,
    context: input.context ?? null,
    source: input.source ?? "user_intent",
    source_brain: brain,
    refine: input.refine ?? null,
    item_id: input.itemId ?? null,
  });
  if (error) throw new Error(`enqueue finds research failed: ${error.message}`);
  return { jobId };
}

/**
 * Claim and process a single job. Atomic on status, so the immediate after()
 * hook and the cron worker never double-run. A find that comes back not-ready
 * is re-queued (until max_attempts) so the next drain retries enrichment.
 */
export async function processFindResearchJob(jobId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();
  const lockedBy = `finds-${crypto.randomUUID().slice(0, 8)}`;

  const { data: claimed } = await supabase
    .from("finds_research_jobs")
    .update({ status: "processing", locked_at: new Date().toISOString(), locked_by: lockedBy })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, user_id, mission, context, source, source_brain, refine, item_id, attempts, max_attempts")
    .maybeSingle();

  if (!claimed) return false;
  const job = claimed as FindsJobRow;

  try {
    let itemId = job.item_id;
    let ready = false;
    let bestName: string | null = null;

    if (job.refine && job.item_id) {
      const { ok, dossier } = await refineFind({ userId: job.user_id, itemId: job.item_id, refine: job.refine });
      if (!ok) throw new Error("refine target not found");
      ready = dossier ? findIsReady(dossier) : false;
      bestName = dossier?.best_pick?.name ?? null;
    } else {
      const { itemId: newId, dossier } = await createFind({
        userId: job.user_id,
        mission: job.mission,
        context: job.context ?? undefined,
        source: job.source,
        sourceBrain: job.source_brain ?? undefined,
      });
      itemId = newId;
      ready = findIsReady(dossier);
      bestName = dossier.best_pick?.name ?? null;
    }

    const attempts = (job.attempts ?? 0) + 1;

    // Not ready yet — keep researching on the next drain (until we give up).
    if (!ready) {
      const giveUp = attempts >= (job.max_attempts ?? 3);
      await supabase
        .from("finds_research_jobs")
        .update({
          status: giveUp ? "done" : "queued", // 'done' even if not ready: stop retrying, find stays in needs_enrichment
          attempts,
          item_id: itemId,
          result: { ready: false, research_state: "needs_enrichment", best_pick_name: bestName },
          summary_text: giveUp ? "Still sourcing — couldn't confirm a clean pick." : null,
          locked_at: null,
          locked_by: null,
        })
        .eq("id", job.id);
      return giveUp; // count as processed only when we stop
    }

    const summaryText = bestName ? `Found it — ${bestName} is in Finds.` : "Your Find is ready in Finds.";
    await supabase
      .from("finds_research_jobs")
      .update({
        status: "done",
        attempts,
        item_id: itemId,
        result: { ready: true, research_state: "ready", best_pick_name: bestName },
        summary_text: summaryText,
        error_message: null,
      })
      .eq("id", job.id);

    if (itemId) await sendFindDonePush(job.user_id, summaryText, itemId).catch(() => {});
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = (job.attempts ?? 0) + 1;
    const giveUp = attempts >= (job.max_attempts ?? 3);
    await supabase
      .from("finds_research_jobs")
      .update({
        status: giveUp ? "failed" : "queued",
        attempts,
        error_message: message,
        locked_at: null,
        locked_by: null,
      })
      .eq("id", job.id);
    console.error("[finds.research] job failed", { jobId: job.id, attempts, message });
    return false;
  }
}

/** Drain queued/retryable jobs (cron backstop). Oldest-first up to `limit`. */
export async function drainFindResearchQueue(limit = 6): Promise<{ processed: number }> {
  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("finds_research_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  let processed = 0;
  for (const id of ids) {
    const ok = await processFindResearchJob(id);
    if (ok) processed++;
  }
  return { processed };
}

async function sendFindDonePush(userId: string, body: string, findId: string): Promise<void> {
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
      sendPushNotification(sub, { title: "Find ready", body, url: `/find/${findId}` }),
    ),
  );
}
