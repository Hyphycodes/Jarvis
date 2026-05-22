import "server-only";

import type { BrainContextPacket } from "@/lib/brain/types";

export type LifeCadenceKey =
  | "basketball"
  | "gun_range"
  | "golf"
  | "spanish_music"
  | "dj_crates"
  | "land_review"
  | "woodworking"
  | "creative_production"
  | "social_room"
  | "gym_recovery"
  | "outdoor_reset";

export type LifeCadenceSignal = {
  key: LifeCadenceKey;
  label: string;
  purposeLabel: string;
  desiredFrequencyDays: number;
  cooldownDays: number;
  overdueScore: number;
  lastTouchedAt?: string;
  shouldSuggestNow: boolean;
};

const CADENCES: Array<{
  key: LifeCadenceKey;
  label: string;
  purposeLabel: string;
  desiredFrequencyDays: number;
  cooldownDays: number;
  match: RegExp;
}> = [
  { key: "basketball", label: "Basketball", purposeLabel: "Health reset", desiredFrequencyDays: 10, cooldownDays: 3, match: /basketball|court|shootaround/i },
  { key: "gun_range", label: "Gun range", purposeLabel: "Skill rep", desiredFrequencyDays: 30, cooldownDays: 10, match: /gun range|range session|shooting/i },
  { key: "golf", label: "Golf", purposeLabel: "Outdoor reset", desiredFrequencyDays: 18, cooldownDays: 6, match: /golf|driving range|tee time/i },
  { key: "spanish_music", label: "Spanish/music learning", purposeLabel: "Skill rep", desiredFrequencyDays: 7, cooldownDays: 2, match: /spanish|song study|music learning/i },
  { key: "dj_crates", label: "DJ crates", purposeLabel: "Creative fuel", desiredFrequencyDays: 7, cooldownDays: 2, match: /dj|crate|records|playlist/i },
  { key: "land_review", label: "Land review", purposeLabel: "Ownership lane", desiredFrequencyDays: 7, cooldownDays: 2, match: /land|real estate|comp review|property/i },
  { key: "woodworking", label: "Woodworking/build skill", purposeLabel: "Skill rep", desiredFrequencyDays: 30, cooldownDays: 10, match: /woodworking|joinery|timber|materials/i },
  { key: "creative_production", label: "Creative production", purposeLabel: "Creative fuel", desiredFrequencyDays: 7, cooldownDays: 2, match: /verse|hook|camera|framing|creative production/i },
  { key: "social_room", label: "Social room", purposeLabel: "Social room", desiredFrequencyDays: 18, cooldownDays: 5, match: /coffee|cigar|dinner|social|invite|relationship/i },
  { key: "gym_recovery", label: "Gym/recovery", purposeLabel: "Recovery", desiredFrequencyDays: 4, cooldownDays: 1, match: /gym|recovery|mobility|workout/i },
  { key: "outdoor_reset", label: "Outdoor reset", purposeLabel: "Outdoor reset", desiredFrequencyDays: 7, cooldownDays: 2, match: /walk|trail|outdoor|forest|sunlight/i },
];

export function evaluateLifeCadence(
  context: BrainContextPacket,
): LifeCadenceSignal[] {
  const recent = context.recentActions.map((action) =>
    `${action.title} ${action.category ?? ""} ${action.status}`,
  );

  return CADENCES.map((cadence) => {
    const matched = recent.some((entry) => cadence.match.test(entry));
    const daysSince = matched ? cadence.cooldownDays : cadence.desiredFrequencyDays + 2;
    const overdueScore = Math.max(
      0,
      Math.min(1, daysSince / cadence.desiredFrequencyDays),
    );
    const coolingDown = context.recentSignals.some((signal) =>
      signal.signal_type.includes(cadence.key) &&
      Date.now() - new Date(signal.created_at).getTime() <
        cadence.cooldownDays * 24 * 60 * 60 * 1000,
    );
    return {
      key: cadence.key,
      label: cadence.label,
      purposeLabel: cadence.purposeLabel,
      desiredFrequencyDays: cadence.desiredFrequencyDays,
      cooldownDays: cadence.cooldownDays,
      overdueScore,
      lastTouchedAt: matched ? context.now : undefined,
      shouldSuggestNow: overdueScore >= 0.72 && !coolingDown,
    };
  }).sort((a, b) => b.overdueScore - a.overdueScore);
}
