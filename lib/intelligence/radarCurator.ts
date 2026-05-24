import "server-only";

import { RADAR_ACTIVE_ITEM_LIMIT, RADAR_MIN_ACTIVE_ITEM_TARGET } from "@/lib/brain/constants";
import { buildJarvisContext } from "@/lib/intelligence/context";
import { enrichRadarItem } from "@/lib/intelligence/core";
import {
  analyzeRadarDiversity,
  selectDiverseRadarSet,
} from "@/lib/intelligence/radarDiversity";
import { RADAR_BOARD_QUALITY_FLOOR } from "@/lib/intelligence/radarScoring";
import { evaluateActiveRadarItem } from "@/lib/intelligence/radarFrontRoom";
import { listIndexItems, rowToIndexedItem } from "@/lib/index/repo";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type { Json, SurfacedItemRow } from "@/lib/types/database";
import type { IndexedItem } from "@/lib/index/types";
import type { JarvisContext, RadarBoard, RadarItem } from "@/lib/intelligence/types";

const PROTECTED_STATUSES = new Set(["saved", "planned", "completed", "archived"]);

export function buildRadarBoard(input: {
  candidates: IndexedItem[];
  context?: JarvisContext;
  currentBoard?: RadarItem[];
  qualityFloor?: number;
  researchRuns?: number;
}): RadarBoard {
  const qualityFloor = input.qualityFloor ?? RADAR_BOARD_QUALITY_FLOOR;
  const enriched = curateRadarCandidates({
    candidates: input.candidates,
    context: input.context,
    currentBoard: input.currentBoard,
    qualityFloor,
  });
  const selected = selectDiverseRadarSet(
    enriched,
    RADAR_MIN_ACTIVE_ITEM_TARGET,
    RADAR_ACTIVE_ITEM_LIMIT,
  );
  const rejectedCount = Math.max(0, input.candidates.length - selected.length);
  const missingContext: string[] = [];
  if (selected.length < RADAR_MIN_ACTIVE_ITEM_TARGET) {
    missingContext.push(
      `Only ${selected.length} strong Radar item${selected.length === 1 ? "" : "s"} passed the front-room gate.`,
    );
  }
  if (enriched.length < RADAR_MIN_ACTIVE_ITEM_TARGET) {
    missingContext.push("Not enough high-quality candidates in existing surfaced/indexed pools.");
  }

  return {
    items: selected,
    minimumTarget: RADAR_MIN_ACTIVE_ITEM_TARGET,
    maximumCap: RADAR_ACTIVE_ITEM_LIMIT,
    qualityFloor,
    diversity: analyzeRadarDiversity(selected),
    researchRuns: input.researchRuns ?? 0,
    rejectedCount,
    missingContext,
  };
}

export function curateRadarCandidates(input: {
  candidates: IndexedItem[];
  context?: JarvisContext;
  currentBoard?: RadarItem[];
  qualityFloor?: number;
}): RadarItem[] {
  const qualityFloor = input.qualityFloor ?? RADAR_BOARD_QUALITY_FLOOR;
  const board: RadarItem[] = [...(input.currentBoard ?? [])];
  return input.candidates
    .map((item) => enrichRadarItem({ item, context: input.context, currentBoard: board }))
    .filter((item) => isStrongRadarItem(item, qualityFloor))
    .sort((a, b) => b.score - a.score);
}

export function isStrongRadarItem(item: RadarItem, qualityFloor = RADAR_BOARD_QUALITY_FLOOR): boolean {
  return (
    item.decision.admission === "radar" &&
    item.score >= qualityFloor &&
    item.title.trim().length > 0 &&
    item.reasonSurfaced.trim().length > 0 &&
    item.strongestAngle.trim().length > 0 &&
    item.decision.negative_flags.length === 0
  );
}

export async function readCurrentRadarBoard(): Promise<RadarBoard> {
  const active = await listIndexItems({
    destination: "radar",
    status: ["shown", "opened"],
    limit: RADAR_ACTIVE_ITEM_LIMIT * 2,
  });
  const context = await buildJarvisContext({ currentRadarItems: active });
  return buildRadarBoard({
    candidates: active,
    context,
    qualityFloor: RADAR_BOARD_QUALITY_FLOOR,
  });
}

export async function readRadarCandidatePool(): Promise<IndexedItem[]> {
  const [active, radarPool, holdingPool] = await Promise.all([
    listIndexItems({
      destination: "radar",
      status: ["shown", "opened"],
      limit: RADAR_ACTIVE_ITEM_LIMIT,
    }),
    listIndexItems({
      destination: "radar",
      status: ["discovered", "shown", "opened"],
      limit: 160,
    }),
    listIndexItems({
      destination: "holding",
      status: ["discovered", "shown"],
      limit: 80,
    }),
  ]);
  return dedupeItems([...active, ...radarPool, ...holdingPool]);
}

export async function writeRadarIntelligence(
  userId: string,
  items: RadarItem[],
): Promise<number> {
  if (items.length === 0) return 0;
  const supabase = await getServerSupabase();
  let updated = 0;
  for (const item of items) {
    const payload = mergeRadarIntelligencePayload(item.item.rawPayload, item);
    const { error } = await supabase
      .from("surfaced_items")
      .update({
        payload,
        score: item.score,
      })
      .eq("id", item.item.id)
      .eq("user_id", userId);
    if (!error) updated++;
  }
  return updated;
}

export function mergeRadarIntelligencePayload(
  payload: unknown,
  item: RadarItem,
): Json {
  const current = isRecord(payload) ? payload : {};
  return {
    ...current,
    purpose_label: item.decision.purpose_label,
    move_title: item.title,
    vibe: item.vibe,
    diversity_group: item.diversityGroup,
    reason_surfaced: item.reasonSurfaced,
    strongest_angle: item.strongestAngle,
    missing_info: item.missingInfo,
    score_breakdown: item.scoreBreakdown,
    plan_readiness: item.planReadiness,
    intelligence: {
      ...(isRecord(current.intelligence) ? current.intelligence : {}),
      enriched_at: new Date().toISOString(),
      vibe: item.vibe,
      diversity_group: item.diversityGroup,
      reason_surfaced: item.reasonSurfaced,
      strongest_angle: item.strongestAngle,
      confidence: item.confidence,
      score: item.score,
      score_breakdown: item.scoreBreakdown,
      evidence: item.evidence,
      missing_info: item.missingInfo,
      suggested_action: item.suggestedAction,
      plan_readiness: item.planReadiness,
      council: item.decision,
    },
  } as Json;
}

export async function rotateWeakActiveRadarItems(
  userId: string,
): Promise<{ reviewed: number; moved: number; archived: number; preserved: number }> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", userId)
    .eq("destination", "radar")
    .in("status", ["shown", "opened"])
    .order("updated_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);

  let moved = 0;
  let archived = 0;
  let preserved = 0;
  const rows = (data ?? []) as SurfacedItemRow[];
  for (const row of rows) {
    if (PROTECTED_STATUSES.has(row.status)) {
      preserved++;
      continue;
    }
    const item = rowToIndexedItem(row);
    const gate = evaluateActiveRadarItem(item);
    const shouldRotate =
      !gate.allowed ||
      (row.score ?? 0) < RADAR_BOARD_QUALITY_FLOOR ||
      hasStaleWeakRadarPayload(row.payload);
    if (!shouldRotate) {
      preserved++;
      continue;
    }
    const next =
      gate.suggestedDestination === "archived"
        ? { status: "archived" as const, destination: row.destination }
        : {
            status: "discovered" as const,
            destination: gate.suggestedDestination === "holding" ? "holding" : "radar",
          };
    const { error: updateError } = await supabase
      .from("surfaced_items")
      .update(next)
      .eq("id", row.id)
      .eq("user_id", userId);
    if (!updateError) {
      if (next.status === "archived") archived++;
      else moved++;
    }
  }
  return { reviewed: rows.length, moved, archived, preserved };
}

function hasStaleWeakRadarPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const briefing = isRecord(payload.briefing) ? payload.briefing : {};
  const bestAction = typeof briefing.best_next_action === "string" ? briefing.best_next_action : "";
  const take = typeof briefing.jarvis_take === "string" ? briefing.jarvis_take : "";
  return /watch|research|ignore|pass/.test(bestAction) || /watch for stronger evidence/i.test(take);
}

function dedupeItems(items: IndexedItem[]): IndexedItem[] {
  const seen = new Set<string>();
  const result: IndexedItem[] = [];
  for (const item of items) {
    const key = [
      item.url ?? "",
      item.sourceId ?? "",
      item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    ]
      .filter(Boolean)
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

