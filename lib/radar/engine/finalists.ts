import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { DINING_SUBLIBRARIES } from "@/lib/radar/engine/sources";

/** Stage 4 — only the top slice by pre_score advances to deep work (the council).
 *  This is how the engine never enriches/judges everything. */
export const FINALIST_SLICE = 12;

export type FinalistResult = { subLibrary: string; promoted: number; errors: string[] };

export async function selectFinalistsSubLibrary(input: {
  userId: string;
  subLibrary: string;
  supabase?: SupabaseClient;
  slice?: number;
}): Promise<FinalistResult> {
  const config = DINING_SUBLIBRARIES[input.subLibrary];
  const result: FinalistResult = { subLibrary: input.subLibrary, promoted: 0, errors: [] };
  if (!config) {
    result.errors.push(`Unknown sub-library: ${input.subLibrary}`);
    return result;
  }
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const slice = input.slice ?? FINALIST_SLICE;

  const { data, error } = await supabase
    .from(config.subLibrary)
    .select("id")
    .eq("user_id", input.userId)
    .eq("status", "scored")
    .order("pre_score", { ascending: false, nullsFirst: false })
    .limit(slice);
  if (error) {
    result.errors.push(`read scored: ${error.message}`);
    return result;
  }
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length === 0) return result;

  const { error: upErr } = await supabase
    .from(config.subLibrary)
    .update({ status: "finalist" })
    .in("id", ids)
    .eq("user_id", input.userId);
  if (upErr) result.errors.push(`promote finalists: ${upErr.message}`);
  else result.promoted = ids.length;
  return result;
}

export async function selectFinalistsDining(input: {
  userId: string;
  supabase?: SupabaseClient;
  slice?: number;
}): Promise<FinalistResult[]> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const out: FinalistResult[] = [];
  for (const subLibrary of Object.keys(DINING_SUBLIBRARIES)) {
    out.push(await selectFinalistsSubLibrary({ userId: input.userId, subLibrary, supabase, slice: input.slice }));
  }
  return out;
}
