import "server-only";

import type { PlanContext } from "@/lib/chat/context/types";

export async function getPlanContext(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/ssr-server").getServerSupabase>>,
  userId: string,
): Promise<PlanContext[]> {
  const { data } = await supabase
    .from("plans")
    .select("id,title,status,build_status,scheduled_date,scheduled_time,summary,updated_at")
    .eq("user_id", userId)
    .not("status", "in", "(completed,cancelled)")
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(8);

  return ((data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    build_status?: string | null;
    scheduled_date?: string | null;
    scheduled_time?: string | null;
    summary: string | null;
  }>).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    buildStatus: row.build_status ?? null,
    scheduledDate: row.scheduled_date ?? null,
    scheduledTime: row.scheduled_time ?? null,
    summary: row.summary,
  }));
}
