import "server-only";

import type { BehaviorSignalContext } from "@/lib/chat/context/types";

export async function getRecentSignalsContext(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/ssr-server").getServerSupabase>>,
  userId: string,
): Promise<BehaviorSignalContext[]> {
  const { data } = await supabase
    .from("behavior_signals")
    .select("signal_type,subject_id,object_type,object_id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(24);

  return ((data ?? []) as Array<{
    signal_type: string;
    subject_id: string | null;
    object_type?: string | null;
    object_id?: string | null;
    created_at: string;
  }>).map((row) => ({
    signalType: row.signal_type,
    subjectId: row.subject_id,
    objectType: row.object_type ?? null,
    objectId: row.object_id ?? null,
    createdAt: row.created_at,
  }));
}
