import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFounderContextPacket } from "@/lib/context/founderContextPacket";
import { toBrainContextPacket } from "@/lib/context/types";
import type { BrainContextPacket } from "@/lib/brain/types";

export async function buildBrainContext(
  options: {
    includeWeather?: boolean;
    userId?: string;
    now?: Date;
    supabase?: SupabaseClient;
  } = {},
): Promise<BrainContextPacket> {
  const packet = await buildFounderContextPacket(options);
  return toBrainContextPacket(packet);
}
