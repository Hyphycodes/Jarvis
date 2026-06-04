import "server-only";

import type { ChatContextPacket } from "@/lib/chat/context/types";

export function compressContext(packet: ChatContextPacket): ChatContextPacket {
  return {
    ...packet,
    activePlans: packet.activePlans.slice(0, 6),
    radar: packet.radar.slice(0, 8),
    circle: packet.circle.slice(0, 8),
    preferences: packet.preferences.slice(0, 22),
    recentSignals: packet.recentSignals.slice(0, 18),
    constraints: packet.constraints.slice(0, 14),
    knownPlaces: packet.knownPlaces.slice(0, 40),
  };
}
