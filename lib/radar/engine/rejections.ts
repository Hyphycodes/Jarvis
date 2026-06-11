import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Controlled rejection reasons — mirrors the radar_pipeline_rejections CHECK. */
export type RejectionReason =
  | "light_enrich_fail"
  | "pre_score_low"
  | "deep_enrich_fail"
  | "council_floor"
  | "devil_advocate_kill"
  | "plan_fail"
  | "plan_generic"
  | "comparative_cut"
  | "editor_cut"
  | "negative_filter_veto";

export type RejectionEntry = { candidateId: string; detail?: string | null };

/**
 * Log per-stage deaths to the queryable rejection table. `reason_detail` is
 * mandatory for devil_advocate_kill (DB CHECK enforces it); callers must supply
 * it there. Best-effort: a logging failure never blocks the pipeline.
 */
export async function logRejections(
  supabase: SupabaseClient,
  input: {
    userId: string;
    subLibrary: string;
    stage: string;
    reason: RejectionReason;
    entries: RejectionEntry[];
  },
): Promise<void> {
  if (input.entries.length === 0) return;
  const rows = input.entries.map((entry) => ({
    user_id: input.userId,
    candidate_id: entry.candidateId,
    sub_library: input.subLibrary,
    stage_died: input.stage,
    reason: input.reason,
    reason_detail: entry.detail ?? null,
  }));
  try {
    await supabase.from("radar_pipeline_rejections").insert(rows);
  } catch (error) {
    console.warn("[engine.rejections] log failed", error instanceof Error ? error.message : error);
  }
}
