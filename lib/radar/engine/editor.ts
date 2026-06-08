import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/** Stage 10 — graduate category_best → radar_library.
 *
 *  NOTE: currently a PASS-THROUGH (graduate all). The intended LLM "assemble the
 *  shelf as a SET (balance/variety/POV)" editor cut 100% of its input in prod, so
 *  it's deferred — the bench (cap 30 + competitive displacement) and render (top
 *  7 + geo/sub_type diversity) already curate the funnel down, so a pass-through
 *  here is correct and unblocks the lane. Re-introduce SET-assembly later as a
 *  refinement (read the whole graduated set, not incremental batches). */

export type EditorResult = {
  lane: string;
  considered: number;
  graduated: number;
  errors: string[];
};

type CategoryBestRow = {
  id: string;
  external_id: string | null;
  name: string;
  sub_type: string | null;
  neighborhood: string | null;
  final_score: number | null;
  enrichment_data: Record<string, unknown> | null;
};

export async function editorAssembleLane(input: {
  userId: string;
  lane: string;
  supabase?: SupabaseClient;
}): Promise<EditorResult> {
  const result: EditorResult = { lane: input.lane, considered: 0, graduated: 0, errors: [] };
  const supabase = input.supabase ?? getSupabaseServiceClient();

  // editor_notes is the processed-flag: rows the editor has already graduated
  // (set non-null) are skipped next cycle. Leaves plan_id free for stage 8.
  const { data, error } = await supabase
    .from("category_best")
    .select("id, external_id, name, sub_type, neighborhood, final_score, enrichment_data")
    .eq("user_id", input.userId)
    .eq("lane", input.lane)
    .is("editor_notes", null)
    .order("comparative_rank", { ascending: true, nullsFirst: false });
  if (error) {
    result.errors.push(`read category_best: ${error.message}`);
    return result;
  }
  const rows = (data ?? []) as CategoryBestRow[];
  result.considered = rows.length;
  if (rows.length === 0) return result;

  const now = new Date().toISOString();
  for (const row of rows) {
    const { error: insErr } = await supabase.from("radar_library").insert({
      user_id: input.userId,
      lane: input.lane,
      source_category_best_id: row.id,
      external_id: row.external_id,
      name: row.name,
      sub_type: row.sub_type,
      neighborhood: row.neighborhood,
      final_score: row.final_score,
      enrichment_data: row.enrichment_data ?? {},
      graduated_at: now,
    });
    // A unique (user_id, lane, external_id) collision means it's already in the
    // library — benign, just mark processed.
    if (insErr && !/duplicate|unique/i.test(insErr.message)) {
      result.errors.push(`graduate ${row.name}: ${insErr.message}`);
      continue;
    }
    await supabase
      .from("category_best")
      .update({ editor_notes: "Selected for shelf." })
      .eq("id", row.id)
      .eq("user_id", input.userId);
    result.graduated += 1;
  }
  return result;
}
