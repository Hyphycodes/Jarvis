import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_OPERATING_PREFERENCES,
  normalizeOperatingPreferences,
  type OperatingPreferences,
} from "@/lib/operating/operatingPreferences";

/**
 * Read declared operating preferences with any client (service or session) for a
 * given user — for server paths without a session (crons, Finds, North recompute).
 * Always resolves to a usable shape; falls back to defaults on miss/error.
 */
export async function readOperatingPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<OperatingPreferences> {
  try {
    const { data } = await supabase
      .from("user_operating_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return data ? normalizeOperatingPreferences(data) : { ...DEFAULT_OPERATING_PREFERENCES };
  } catch {
    return { ...DEFAULT_OPERATING_PREFERENCES };
  }
}
