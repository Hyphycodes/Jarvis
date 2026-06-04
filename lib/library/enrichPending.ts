import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { enrichPlace, type EnrichmentStatus } from "@/lib/library/enrichPlace";

const DEFAULT_LIMIT = 15;
const MIN_STRENGTH = 0.7;
const DELAY_MS = 400;

export type EnrichPendingResult = {
  scanned: number;
  enriched: number;
  noMatch: number;
  byStatus: Record<EnrichmentStatus, number>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Find strong Library places blocked on missing location/hours and enrich them,
 * sequentially with a small delay to respect Google/Tavily rate limits.
 */
export async function enrichPending(
  userId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<EnrichPendingResult> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("places_library")
    .select("id")
    .eq("user_id", userId)
    .gte("verdict_strength", MIN_STRENGTH)
    .or("address.is.null,lat.is.null,hours_summary.is.null")
    .order("verdict_strength", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`enrichPending query failed: ${error.message}`);
  }

  const rows = (data ?? []) as { id: string }[];
  const byStatus = {
    enriched: 0,
    no_place_match: 0,
    nothing_to_fill: 0,
    not_found: 0,
    skipped_no_google: 0,
  } as Record<EnrichmentStatus, number>;

  for (let i = 0; i < rows.length; i++) {
    try {
      const result = await enrichPlace(rows[i].id);
      byStatus[result.status] += 1;
    } catch (err) {
      console.error("[enrichPending] place failed", { id: rows[i].id, err });
    }
    if (i < rows.length - 1) await sleep(DELAY_MS);
  }

  return {
    scanned: rows.length,
    enriched: byStatus.enriched,
    noMatch: byStatus.no_place_match,
    byStatus,
  };
}
