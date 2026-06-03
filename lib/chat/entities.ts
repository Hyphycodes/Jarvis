import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { recordAiAction } from "@/lib/chat/aiActions";
import type {
  EntityCandidate,
  EntityRow,
  ImageAnalysisResult,
} from "@/lib/chat/types";

export function canonicalEntityName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function entitiesFromImageAnalysis(
  analysis: ImageAnalysisResult,
): EntityCandidate[] {
  const out: EntityCandidate[] = [];
  const add = (
    name: string | undefined,
    type: EntityCandidate["type"],
    role: EntityCandidate["role"],
    confidence = confidenceNumber(analysis.confidence),
    metadata: EntityCandidate["metadata"] = {},
  ) => {
    if (!name?.trim()) return;
    const canonicalName = canonicalEntityName(name);
    if (!canonicalName) return;
    if (out.some((e) => e.type === type && e.canonicalName === canonicalName && e.role === role)) return;
    out.push({ type, name: name.trim(), canonicalName, role, confidence, metadata });
  };

  const ex = analysis.extracted;
  add(ex.venue_name, "place", "primary_subject", undefined, { image_type: analysis.type });
  add(ex.location, "neighborhood", "location");
  add(ex.account_name, "source", "source", undefined, {
    display_name: ex.account_display_name ?? null,
    source_signal: ex.source_credibility_signal ?? null,
  });
  add(ex.event_name, "event", "primary_subject", undefined, { event_date: ex.event_date ?? null });
  add(ex.product_or_brand, "brand", analysis.type === "product" ? "primary_subject" : "mentioned");
  add(ex.document_type, "document", "primary_subject");

  return out;
}

export async function upsertObservationEntities(input: {
  userId: string;
  observationId: string;
  entities: EntityCandidate[];
}): Promise<EntityRow[]> {
  if (!input.entities.length) return [];

  const supabase = await getServerSupabase();
  const rows: EntityRow[] = [];
  for (const entity of input.entities) {
    const { data, error } = await supabase
      .from("entities")
      .upsert(
        {
          user_id: input.userId,
          type: entity.type,
          name: entity.name,
          canonical_name: entity.canonicalName,
          metadata: entity.metadata ?? {},
          confidence: entity.confidence,
        },
        { onConflict: "user_id,type,canonical_name" },
      )
      .select("*")
      .single();
    if (error || !data) {
      console.error("[chat.entities] upsert failed", error);
      continue;
    }

    const row = data as EntityRow;
    rows.push(row);
    const { error: linkError } = await supabase
      .from("observation_entities")
      .upsert(
        {
          observation_id: input.observationId,
          entity_id: row.id,
          user_id: input.userId,
          role: entity.role,
        },
        { onConflict: "observation_id,entity_id,role" },
      );
    if (linkError) console.error("[chat.entities] link failed", linkError);
  }

  await recordAiAction({
    userId: input.userId,
    actionType: "extract_entities",
    inputObservationId: input.observationId,
    targetTable: "entities",
    targetId: rows.map((r) => r.id).join(","),
    confidence: average(rows.map((r) => r.confidence)),
    reasoningSummary: `Linked ${rows.length} entity candidates to observation.`,
    stateAfter: "recognized",
  });

  return rows;
}

function confidenceNumber(value: ImageAnalysisResult["confidence"]) {
  if (value === "high") return 0.85;
  if (value === "medium") return 0.62;
  return 0.35;
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}
