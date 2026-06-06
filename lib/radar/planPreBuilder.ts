import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createStubPlan, fillPlan } from "@/lib/actions/plans";

/** Give up pre-building a plan after this many failed/fallback attempts. */
const MAX_PLAN_BUILD_ATTEMPTS = 4;

type PreBuildRow = {
  id: string;
  payload: unknown;
};

export async function preBuildPlansForShownItems(
  userId: string,
  supabase: SupabaseClient,
  opts: { maxItems?: number } = {},
): Promise<{ built: number; errors: string[] }> {
  const max = opts.maxItems ?? 2;
  const errors: string[] = [];
  let built = 0;

  const { data: rows, error: queryError } = await supabase
    .from("surfaced_items")
    .select("id, payload")
    .eq("user_id", userId)
    .eq("status", "shown")
    .eq("destination", "radar")
    .order("updated_at", { ascending: false })
    .limit(max * 4);

  if (queryError || !rows) {
    errors.push(queryError?.message ?? "Failed to query shown items");
    return { built, errors };
  }

  const needsPlan = ((rows ?? []) as PreBuildRow[])
    .filter((row) => {
      const payload = isRecord(row.payload) ? row.payload : null;
      if (payload?.plan_build_exhausted) return false;
      // Skip items the intelligence layer marked as not ready for a plan.
      // These lack enough context (source, evidence) to produce a useful plan
      // and will only burn retries. They'll still show as Radar cards.
      if (payload?.plan_disposition === "not_ready") return false;
      if (!payload?.plan_slug) return true;
      // Retry plans that are still building OR previously failed (schema/transient).
      // Also retry 'draft' — that's a legacy status from before the pre-builder was
      // introduced; items can end up with a stale plan_slug pointing to a deleted
      // plan, and they'd be stuck forever without this.
      // 'cancelled' and 'ready' are intentional terminal states — never retry those.
      return (
        payload.plan_status === "building" ||
        payload.plan_status === "failed" ||
        payload.plan_status === "draft"
      );
    })
    .slice(0, max);

  for (const row of needsPlan) {
    try {
      const stub = await createStubPlan({
        itemId: row.id,
        userId,
        preserveItemSurface: true,
      });

      const filled = await fillPlan({
        planId: stub.planId,
        userId,
        itemId: row.id,
        preserveItemSurface: true,
        persistFallback: false,
      });

      if (filled.fallbackUsed) {
        // Keep the SAME stub plan and retry it next run. Previously this deleted
        // plan_slug/plan_id, which orphaned the plan and made createStubPlan spawn
        // a brand-new stub every cycle (the source of the pile of half-built
        // "building" plans). Now we reuse it and only give up after MAX_ATTEMPTS.
        const { data: itemRow } = await supabase
          .from("surfaced_items")
          .select("payload")
          .eq("id", row.id)
          .eq("user_id", userId)
          .single();
        const payload = isRecord(itemRow?.payload) ? { ...itemRow.payload } : {};
        const attempts =
          (typeof payload.plan_build_attempts === "number"
            ? payload.plan_build_attempts
            : 0) + 1;
        const exhausted = attempts >= MAX_PLAN_BUILD_ATTEMPTS;

        const { error: planError } = await supabase
          .from("plans")
          // Leave it claimable next run (building) until we give up (failed).
          .update({ build_status: exhausted ? "failed" : "building" })
          .eq("id", stub.planId)
          .eq("user_id", userId);
        if (planError) {
          errors.push(
            `Plan pre-build fallback reset failed for item ${row.id}: ${planError.message}`,
          );
        }

        payload.plan_build_attempts = attempts;
        payload.plan_status = exhausted ? "failed" : "building";
        if (exhausted) payload.plan_build_exhausted = true;
        const { error: itemError } = await supabase
          .from("surfaced_items")
          .update({ payload })
          .eq("id", row.id)
          .eq("user_id", userId);
        if (itemError) {
          errors.push(
            `Plan pre-build fallback item reset failed for item ${row.id}: ${itemError.message}`,
          );
        }
        continue;
      }

      built++;
    } catch (err) {
      errors.push(
        `Plan pre-build failed for item ${row.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  return { built, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
