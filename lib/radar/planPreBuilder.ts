import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createStubPlan, fillPlan } from "@/lib/actions/plans";

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
      if (!payload?.plan_slug) return true;
      return payload.plan_status === "building";
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
        const { error: planError } = await supabase
          .from("plans")
          .update({ build_status: "building" })
          .eq("id", stub.planId)
          .eq("user_id", userId);
        if (planError) {
          errors.push(
            `Plan pre-build fallback reset failed for item ${row.id}: ${planError.message}`,
          );
        }

        const { data: itemRow } = await supabase
          .from("surfaced_items")
          .select("payload")
          .eq("id", row.id)
          .eq("user_id", userId)
          .single();
        const payload = isRecord(itemRow?.payload) ? { ...itemRow.payload } : {};
        const attempts =
          typeof payload.plan_build_attempts === "number"
            ? payload.plan_build_attempts
            : 0;
        delete payload.plan_slug;
        delete payload.plan_id;
        delete payload.plan_status;
        payload.plan_build_attempts = attempts + 1;
        if (attempts + 1 >= 4) {
          payload.plan_build_exhausted = true;
        }
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
