import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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

export type NorthLifeCadenceLane = {
  id: string;
  title: string;
  status: "active" | "warm" | "cooling" | "due" | "protected";
  cadenceTarget: string;
  lastTouched?: string;
  nextUsefulRep: string;
  whyItMatters: string;
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
    const signalTouch = context.recentSignals.find((signal) =>
      signal.signal_type.includes(cadence.key),
    );
    const daysSince = signalTouch
      ? daysBetween(signalTouch.created_at, context.now)
      : matched
        ? cadence.cooldownDays
        : cadence.desiredFrequencyDays + 2;
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
      lastTouchedAt: signalTouch?.created_at ?? (matched ? context.now : undefined),
      shouldSuggestNow: overdueScore >= 0.72 && !coolingDown,
    };
  }).sort((a, b) => b.overdueScore - a.overdueScore);
}

export function buildNorthLifeCadence(
  context: BrainContextPacket,
): NorthLifeCadenceLane[] {
  const signals = evaluateLifeCadence(context);
  const byKey = new Map(signals.map((signal) => [signal.key, signal]));
  return [
    lane("body_performance", "Body / Performance", "basketball", "Every 1-2 weeks", "Play basketball outside or get a recovery block in.", "Keeps the body sharp enough to carry the rest of the build.", byKey),
    lane("skill_competence", "Skill / Competence", "gun_range", "Weekly to monthly", "Gun range session, Spanish song study, or one build-skill rep.", "Competence compounds when the reps stay warm.", byKey),
    lane("creative_hyphy", "Creative / Hyphy", "dj_crates", "Weekly", "DJ crate cleanup or one camera framing practice.", "Keeps the Hyphy world visually and musically alive.", byKey),
    lane("ownership_land_wealth", "Ownership / Land / Wealth", "land_review", "Weekly", "Review one land listing or real estate comp.", "Ownership stays real when the research thread stays active.", byKey),
    lane("taste_culture", "Taste / Culture", "social_room", "1-2x per month", "Find one tasteful room, dinner, watch, or menswear reference.", "Taste is a filter, not decoration.", byKey),
    lane("relationships_social", "Relationships / Social", "social_room", "Every 2-3 weeks", "Text or invite one person worth keeping close.", "The real network is built through intentional rooms.", byKey),
    {
      id: "peace_discipline",
      title: "Peace / Discipline",
      status: "protected",
      cadenceTarget: "Daily posture",
      nextUsefulRep: "Keep the board clean and protect focus.",
      whyItMatters: "Not every empty space needs to be filled.",
    },
  ];
}

function lane(
  id: string,
  title: string,
  signalKey: LifeCadenceKey,
  cadenceTarget: string,
  nextUsefulRep: string,
  whyItMatters: string,
  byKey: Map<LifeCadenceKey, LifeCadenceSignal>,
): NorthLifeCadenceLane {
  const signal = byKey.get(signalKey);
  return {
    id,
    title,
    status: statusForSignal(signal),
    cadenceTarget,
    lastTouched: signal?.lastTouchedAt,
    nextUsefulRep,
    whyItMatters,
  };
}

function statusForSignal(
  signal: LifeCadenceSignal | undefined,
): NorthLifeCadenceLane["status"] {
  if (!signal) return "warm";
  if (signal.shouldSuggestNow || signal.overdueScore >= 0.95) return "due";
  if (signal.lastTouchedAt && signal.overdueScore <= 0.35) return "active";
  if (signal.overdueScore >= 0.65) return "cooling";
  return "warm";
}

export type RecentCadenceIntensity = "heavy" | "moderate" | "quiet";

export async function inferRecentCadence(input: {
  userId: string;
  supabase: SupabaseClient;
}): Promise<{ intensity: RecentCadenceIntensity }> {
  const { userId, supabase } = input;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data } = await supabase
      .from("surfaced_items")
      .select("status")
      .eq("user_id", userId)
      .gte("updated_at", sevenDaysAgo)
      .in("status", ["saved", "passed", "completed", "planned"]);

    const rows = (data ?? []) as Array<{ status: string }>;
    const saves = rows.filter((r) => r.status === "saved").length;
    const completions = rows.filter((r) => r.status === "completed" || r.status === "planned").length;
    const passes = rows.filter((r) => r.status === "passed").length;

    // Heavy: 3+ completions OR 5+ saves
    if (completions >= 3 || saves >= 5) return { intensity: "heavy" };
    // Quiet: 0 completions AND 2+ passes
    if (completions === 0 && passes >= 2) return { intensity: "quiet" };
    return { intensity: "moderate" };
  } catch {
    return { intensity: "moderate" };
  }
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (to - from) / (24 * 60 * 60 * 1000));
}
