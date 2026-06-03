import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type { Json } from "@/lib/types/database";

export async function recordAiAction(input: {
  userId: string;
  actionType: string;
  inputObservationId?: string | null;
  targetTable?: string | null;
  targetId?: string | null;
  confidence?: number | null;
  reasoningSummary?: string | null;
  wasUserConfirmed?: boolean;
  stateBefore?: string | null;
  stateAfter?: string | null;
  metadata?: Json;
}): Promise<void> {
  try {
    const supabase = await getServerSupabase();
    const { error } = await supabase.from("ai_actions").insert({
      user_id: input.userId,
      action_type: input.actionType,
      input_observation_id: input.inputObservationId ?? null,
      target_table: input.targetTable ?? null,
      target_id: input.targetId ?? null,
      confidence: input.confidence ?? null,
      reasoning_summary: input.reasoningSummary ?? null,
      was_user_confirmed: input.wasUserConfirmed ?? false,
      state_before: input.stateBefore ?? null,
      state_after: input.stateAfter ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) console.error("[chat.aiActions] insert failed", error);
  } catch (error) {
    console.error("[chat.aiActions] insert failed", error);
  }
}
