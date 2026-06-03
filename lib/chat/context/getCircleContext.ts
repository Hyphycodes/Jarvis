import "server-only";

import type { CirclePersonContext } from "@/lib/chat/context/types";

export async function getCircleContext(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/ssr-server").getServerSupabase>>,
  userId: string,
): Promise<CirclePersonContext[]> {
  const { data } = await supabase
    .from("circle_people")
    .select("id,name,category,role,closeness_score,last_interaction,notes")
    .eq("user_id", userId)
    .order("closeness_score", { ascending: false })
    .limit(12);

  return ((data ?? []) as Array<{
    id: string;
    name: string;
    category: string;
    role: string | null;
    closeness_score: number;
    last_interaction: string | null;
    notes: string[] | null;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    role: row.role,
    closenessScore: Number(row.closeness_score ?? 0),
    lastInteraction: row.last_interaction,
    notes: row.notes ?? [],
  }));
}
