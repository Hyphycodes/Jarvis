import "server-only";

import { buildFounderContextPacket } from "@/lib/context/founderContextPacket";
import { toBrainContextPacket } from "@/lib/context/types";
import type { BrainContextPacket } from "@/lib/brain/types";

export async function buildBrainContext(
  options: {
    includeWeather?: boolean;
    userId?: string;
    now?: Date;
  } = {},
): Promise<BrainContextPacket> {
  const packet = await buildFounderContextPacket(options);
  return toBrainContextPacket(packet);
}
