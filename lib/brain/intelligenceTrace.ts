import type { BrainContextPacket } from "@/lib/brain/types";
import type { IntelligenceReason } from "@/lib/brain/intelligenceReason";
import type { FounderContextPacket, NorthAlignment } from "@/lib/context/types";
import type { Json } from "@/lib/types/database";

export type IntelligenceTraceSurface =
  | "radar"
  | "today"
  | "circle"
  | "north"
  | "chat"
  | "voice"
  | "plan"
  | "scout"
  | "cron";

export type IntelligenceTraceInput = {
  userId: string;
  route: string;
  surface: IntelligenceTraceSurface;
  decisionType: string;
  entityType?: string | null;
  entityId?: string | null;
  contextSummary?: Json;
  reasoning?: IntelligenceReason | Record<string, unknown>;
  candidatesConsidered?: Json | null;
  selectedCandidate?: Json | null;
  rejectedCandidates?: Json | null;
  northAlignment?: NorthAlignment | Json | null;
  behaviorInfluence?: Json | null;
  circleInfluence?: Json | null;
  memoryInfluence?: Json | null;
  sourceQuality?: Json | null;
  confidence?: number | null;
  outcome?: string | null;
};

export type ContextTraceSummary = {
  now: string;
  home?: string | null;
  north: string[];
  recentActions: string[];
  activePlan?: string | null;
  people: string[];
  memory: string[];
  weather?: string | null;
};

export function buildContextTraceSummary(
  context: BrainContextPacket | FounderContextPacket,
): ContextTraceSummary {
  if ("northTags" in context) {
    return {
      now: context.now,
      home: [context.homeCity, context.homeState].filter(Boolean).join(", ") || null,
      north: context.northTags.slice(0, 8),
      recentActions: context.recentActions
        .slice(0, 8)
        .map((action) => `${action.status}: ${action.title}`),
      activePlan: context.activePlan?.title ?? null,
      people: (context.people ?? [])
        .slice(0, 6)
        .map((person) => person.recent_update
          ? `${person.name}: ${person.recent_update.title}`
          : person.name),
      memory: context.memory.slice(0, 8).map((memory) => memory.content),
      weather: context.weather
        ? `${Math.round(context.weather.temperatureF)}F`
        : null,
    };
  }

  return {
    now: context.now,
    home: [context.location.homeCity, context.location.homeState].filter(Boolean).join(", ") || null,
    north: context.north.tags.slice(0, 8),
    recentActions: context.behavior.recentItemActions
      .slice(0, 8)
      .map((action) => `${action.status}: ${action.title}`),
    activePlan: context.today.activePlan?.title ?? null,
    people: context.circle.upcomingMoments
      .slice(0, 6)
      .map((moment) => moment.suggestedAction
        ? `${moment.title}: ${moment.suggestedAction}`
        : moment.title),
    memory: context.memory.stablePreferences.slice(0, 8).map((memory) => memory.content),
    weather: context.weather ? `${Math.round(context.weather.temperatureF)}F` : null,
  };
}

export async function writeIntelligenceTrace(
  input: IntelligenceTraceInput,
): Promise<string | null> {
  const { getServerSupabase } = await import("@/lib/supabase/ssr-server");
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("intelligence_traces")
    .insert({
      user_id: input.userId,
      route: input.route,
      surface: input.surface,
      decision_type: input.decisionType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      context_summary: input.contextSummary ?? {},
      reasoning: (input.reasoning ?? {}) as Json,
      candidates_considered: input.candidatesConsidered ?? null,
      selected_candidate: input.selectedCandidate ?? null,
      rejected_candidates: input.rejectedCandidates ?? null,
      north_alignment: (input.northAlignment ?? null) as Json | null,
      behavior_influence: input.behaviorInfluence ?? null,
      circle_influence: input.circleInfluence ?? null,
      memory_influence: input.memoryInfluence ?? null,
      source_quality: input.sourceQuality ?? null,
      confidence:
        typeof input.confidence === "number" ? clamp01(input.confidence) : null,
      outcome: input.outcome ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

export async function safeWriteIntelligenceTrace(
  input: IntelligenceTraceInput,
  writer: (trace: IntelligenceTraceInput) => Promise<unknown> = writeIntelligenceTrace,
): Promise<boolean> {
  try {
    await writer(input);
    return true;
  } catch (error) {
    console.error("[intelligence.trace] write failed", {
      route: input.route,
      surface: input.surface,
      decisionType: input.decisionType,
      error,
    });
    return false;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
