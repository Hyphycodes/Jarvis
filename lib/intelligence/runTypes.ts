import "server-only";

export const ambientRunTypes = [
  "daily_maintenance",
  "radar_discovery",
  "weekend_preview",
  "holding_review",
  "north_reflection",
] as const;

export type AmbientRunType = (typeof ambientRunTypes)[number];

export type AmbientRunPolicy = {
  label: string;
  cooldownHours: number;
  maxClaudeCalls: number;
  maxSourceCalls: number;
  maxCandidates: number;
  maxBriefings: number;
  heavyDiscovery: boolean;
};

export const AMBIENT_RUN_POLICIES: Record<AmbientRunType, AmbientRunPolicy> = {
  daily_maintenance: {
    label: "Daily Maintenance",
    cooldownHours: 18,
    maxClaudeCalls: 0,
    maxSourceCalls: 0,
    maxCandidates: 0,
    maxBriefings: 0,
    heavyDiscovery: false,
  },
  radar_discovery: {
    label: "Radar Discovery",
    cooldownHours: 18,
    maxClaudeCalls: 8,
    maxSourceCalls: 12,
    maxCandidates: 60,
    maxBriefings: 12,
    heavyDiscovery: true,
  },
  weekend_preview: {
    label: "Weekend Preview",
    cooldownHours: 36,
    maxClaudeCalls: 8,
    maxSourceCalls: 14,
    maxCandidates: 70,
    maxBriefings: 12,
    heavyDiscovery: true,
  },
  holding_review: {
    label: "Holding Review",
    cooldownHours: 36,
    maxClaudeCalls: 4,
    maxSourceCalls: 0,
    maxCandidates: 40,
    maxBriefings: 6,
    heavyDiscovery: false,
  },
  north_reflection: {
    label: "North Reflection",
    cooldownHours: 96,
    maxClaudeCalls: 2,
    maxSourceCalls: 0,
    maxCandidates: 8,
    maxBriefings: 3,
    heavyDiscovery: false,
  },
};

export function parseAmbientRunType(value: unknown): AmbientRunType | null {
  return typeof value === "string" &&
    ambientRunTypes.includes(value as AmbientRunType)
    ? (value as AmbientRunType)
    : null;
}

export function decisionRunType(runType: AmbientRunType): string {
  return `ambient.${runType}`;
}
