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
      return !payload?.plan_slug;
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
        const { error } = await supabase
          .from("plans")
          .update({ build_status: "building" })
          .eq("id", stub.planId)
          .eq("user_id", userId);
        if (error) {
          errors.push(
            `Plan pre-build fallback reset failed for item ${row.id}: ${error.message}`,
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
