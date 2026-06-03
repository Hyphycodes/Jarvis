import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type { Json } from "@/lib/types/database";

export async function recordChatBehaviorSignal(input: {
  userId: string;
  signalType: string;
  objectType?: string | null;
  objectId?: string | null;
  subjectId?: string | null;
  metadata?: Json;
  payload?: Json;
}): Promise<void> {
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("behavior_signals").insert({
    user_id: input.userId,
    signal_type: input.signalType,
    subject_id: input.subjectId ?? input.objectId ?? null,
    object_type: input.objectType ?? null,
    object_id: input.objectId ?? null,
    metadata: input.metadata ?? {},
    payload: input.payload ?? {},
  });
  if (error) console.error("[chat.behaviorSignals] insert failed", error);
}
