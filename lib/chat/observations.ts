import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { recordAiAction } from "@/lib/chat/aiActions";
import type { Json } from "@/lib/types/database";
import type { ObservationRow, PlanningState } from "@/lib/chat/types";

export async function createObservation(input: {
  userId: string;
  sourceType: ObservationRow["source_type"];
  rawInputUrl?: string | null;
  extractedText?: string | null;
  interpretedType?: string | null;
  entitiesJson?: Json;
  confidence?: number;
  state?: PlanningState;
  metadata?: Json;
}): Promise<ObservationRow> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("observations")
    .insert({
      user_id: input.userId,
      source_type: input.sourceType,
      raw_input_url: input.rawInputUrl ?? null,
      extracted_text: input.extractedText ?? null,
      interpreted_type: input.interpretedType ?? null,
      entities_json: input.entitiesJson ?? [],
      confidence: input.confidence ?? 0.5,
      state: input.state ?? "observed",
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Observation insert failed");
  }

  const row = data as ObservationRow;
  await recordAiAction({
    userId: input.userId,
    actionType: "create_observation",
    inputObservationId: row.id,
    targetTable: "observations",
    targetId: row.id,
    confidence: input.confidence ?? 0.5,
    reasoningSummary: `Captured ${input.sourceType} intake before taking action.`,
    stateAfter: row.state,
  });
  return row;
}

export async function updateObservation(input: {
  userId: string;
  observationId: string;
  extractedText?: string | null;
  interpretedType?: string | null;
  entitiesJson?: Json;
  confidence?: number;
  state?: PlanningState;
  metadataPatch?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await getServerSupabase();
  const patch: Record<string, unknown> = {};
  if ("extractedText" in input) patch.extracted_text = input.extractedText ?? null;
  if ("interpretedType" in input) patch.interpreted_type = input.interpretedType ?? null;
  if ("entitiesJson" in input) patch.entities_json = input.entitiesJson ?? [];
  if ("confidence" in input) patch.confidence = input.confidence ?? 0.5;
  if ("state" in input) patch.state = input.state;

  if (input.metadataPatch) {
    const { data } = await supabase
      .from("observations")
      .select("metadata")
      .eq("id", input.observationId)
      .eq("user_id", input.userId)
      .maybeSingle();
    const existing = isRecord((data as { metadata?: unknown } | null)?.metadata)
      ? ((data as { metadata: Record<string, unknown> }).metadata)
      : {};
    patch.metadata = { ...existing, ...input.metadataPatch };
  }

  const { error } = await supabase
    .from("observations")
    .update(patch)
    .eq("id", input.observationId)
    .eq("user_id", input.userId);
  if (error) throw new Error(error.message);
}

export async function getObservation(
  userId: string,
  observationId: string,
): Promise<ObservationRow | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("observations")
    .select("*")
    .eq("id", observationId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ObservationRow | null) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
