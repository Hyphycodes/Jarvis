import "server-only";

import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type { Json } from "@/lib/types/database";

export type ScheduledPlan = {
  planId: string;
  slug: string;
  title: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string | null; // HH:MM (24h)
  buildStatus: string;
  heroImage: string | null;
};

/** All scheduled plans for the owner, used by the in-app calendar. */
export async function loadScheduledPlans(): Promise<ScheduledPlan[]> {
  const { id: userId } = await getViewableProfileId();
  if (!userId) return [];

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("plans")
    .select("id,title,scheduled_date,scheduled_time,build_status,key_stats")
    .eq("user_id", userId)
    .not("scheduled_date", "is", null)
    .order("scheduled_date", { ascending: true });
  if (error || !data) {
    if (error) console.error("[loadScheduledPlans]", error);
    return [];
  }

  const rows = data as Array<{
    id: string;
    title: string;
    scheduled_date: string;
    scheduled_time: string | null;
    build_status: string;
    key_stats: Json;
  }>;

  // Batch-fetch hero images via the source items' persisted brief.
  const sourceIds = rows
    .map((r) => readString(r.key_stats, "source_item_id"))
    .filter((v): v is string => Boolean(v));
  const heroByItem = await loadHeroImages(sourceIds);

  return rows.map((r) => {
    const sourceId = readString(r.key_stats, "source_item_id");
    return {
      planId: r.id,
      slug: readString(r.key_stats, "slug") ?? r.id,
      title: r.title,
      scheduledDate: r.scheduled_date,
      scheduledTime: r.scheduled_time,
      buildStatus: r.build_status,
      heroImage: sourceId ? heroByItem.get(sourceId) ?? null : null,
    };
  });
}

async function loadHeroImages(
  itemIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (itemIds.length === 0) return out;
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("surfaced_items")
    .select("id,image_url,payload")
    .in("id", itemIds);
  for (const row of (data ?? []) as Array<{
    id: string;
    image_url: string | null;
    payload: Json;
  }>) {
    const brief = readRecord(row.payload, "brief");
    const heroFromBrief =
      brief && typeof brief.hero_image_url === "string"
        ? brief.hero_image_url
        : null;
    out.set(row.id, heroFromBrief ?? row.image_url ?? null);
  }
  return out;
}

function readString(value: Json, key: string): string | undefined {
  const rec = asRecord(value);
  const v = rec?.[key];
  return typeof v === "string" ? v : undefined;
}

function readRecord(value: Json, key: string): Record<string, unknown> | null {
  const rec = asRecord(value);
  const v = rec?.[key];
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asRecord(value: Json): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
