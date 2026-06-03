import "server-only";

import type { RadarItemContext } from "@/lib/chat/context/types";

export async function getRadarContext(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/ssr-server").getServerSupabase>>,
  userId: string,
): Promise<RadarItemContext[]> {
  const { data } = await supabase
    .from("surfaced_items")
    .select("id,title,category,status,planning_state,taste_fit_summary,reasons")
    .eq("user_id", userId)
    .eq("destination", "radar")
    .in("status", ["discovered", "shown", "saved"])
    .order("updated_at", { ascending: false })
    .limit(10);

  return ((data ?? []) as Array<{
    id: string;
    title: string | null;
    category: string | null;
    status: string;
    planning_state?: string | null;
    taste_fit_summary?: string | null;
    reasons?: string[] | null;
  }>).map((row) => ({
    id: row.id,
    title: row.title ?? "Untitled",
    category: row.category,
    status: row.status,
    planningState: row.planning_state ?? null,
    tasteFitSummary: row.taste_fit_summary ?? null,
    reasons: row.reasons ?? [],
  }));
}
