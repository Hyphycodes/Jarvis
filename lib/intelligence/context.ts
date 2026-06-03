import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildBrainContext } from "@/lib/brain/context";
import type { JarvisContext } from "@/lib/intelligence/types";
import type { IndexedItem } from "@/lib/index/types";

export async function buildJarvisContext(input: {
  currentRadarItems?: IndexedItem[];
  userId?: string;
  supabase?: SupabaseClient;
} = {}): Promise<JarvisContext> {
  const context = await buildBrainContext({
    userId: input.userId,
    supabase: input.supabase,
  });
  return {
    ...context,
    currentRadarItems: input.currentRadarItems,
    activeRadarCount: input.currentRadarItems?.length,
  };
}
