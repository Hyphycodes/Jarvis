import "server-only";

import {
  RADAR_ACTIVE_ITEM_LIMIT,
  RADAR_MIN_ACTIVE_ITEM_TARGET,
  RADAR_UNDERFILLED_PROMOTION_FLOOR,
} from "@/lib/brain/constants";
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
const HARD_ACTIVE_BLOCK_FLAGS = new Set([
  "weak_evidence",
  "social_noise",
  "instagram_noise",
  "facebook_noise",
  "raw_comment",
  "too_literal",
  "closed_event",
  "expired_event",
  "misclassified",
  "no_clear_move",
  "title_unclear",
  "directory_spam",
  "seo_junk",
  "source_lead_only",
  "generic",
  "not_actionable",
  "fake_luxury",
  "corny",
  "hype_noise",
]);

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
    item.radarDisposition === "active" &&
    item.score >= qualityFloor &&
    item.title.trim().length > 0 &&
    item.reasonSurfaced.trim().length > 0 &&
    item.strongestAngle.trim().length > 0 &&
    !hasHardActiveBlock(item)
  );
}

export function isPromotableWhenUnderfilled(item: RadarItem): boolean {
  return (
    item.radarDisposition === "active" &&
    item.score >= RADAR_UNDERFILLED_PROMOTION_FLOOR &&
    item.confidence >= RADAR_UNDERFILLED_PROMOTION_FLOOR &&
    item.evidence.quality >= 0.45 &&
    item.title.trim().length > 0 &&
    item.category.trim().length > 0 &&
    item.reasonSurfaced.trim().length > 0 &&
    item.strongestAngle.trim().length > 0 &&
    !hasHardActiveBlock(item)
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
    qualityFloor:
      active.length < RADAR_MIN_ACTIVE_ITEM_TARGET
        ? RADAR_UNDERFILLED_PROMOTION_FLOOR
        : RADAR_BOARD_QUALITY_FLOOR,
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

export type HoldingPromotionResult = {
  reviewed: number;
  promoted: number;
  blocked: number;
  promoted_ids: string[];
  reasons: string[];
};

export async function promoteQualifiedHoldingItems(
  userId: string,
  slots: number,
): Promise<HoldingPromotionResult> {
  if (slots <= 0) {
    return { reviewed: 0, promoted: 0, blocked: 0, promoted_ids: [], reasons: [] };
  }
  const supabase = await getServerSupabase();
  const [activeRes, holdingRes, passedRes] = await Promise.all([
    supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", userId)
      .eq("destination", "radar")
      .in("status", ["shown", "opened"])
      .order("updated_at", { ascending: false })
      .limit(RADAR_ACTIVE_ITEM_LIMIT),
    supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", userId)
      .eq("destination", "holding")
      .in("status", ["discovered", "shown", "opened"])
      .order("updated_at", { ascending: false })
      .limit(80),
    supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["passed", "archived"])
      .order("updated_at", { ascending: false })
      .limit(120),
  ]);
  if (activeRes.error) throw new Error(activeRes.error.message);
  if (holdingRes.error) throw new Error(holdingRes.error.message);
  if (passedRes.error) throw new Error(passedRes.error.message);

  const activeRows = (activeRes.data ?? []) as SurfacedItemRow[];
  const holdingRows = (holdingRes.data ?? []) as SurfacedItemRow[];
  const passedRows = (passedRes.data ?? []) as SurfacedItemRow[];
  const activeItems = activeRows.map(rowToIndexedItem);
  const activeBoard = activeItems.map((item) => enrichRadarItem({ item }));
  const context = await buildJarvisContext({ currentRadarItems: activeItems });
  const blockedKeys = new Set(passedRows.map(nearDuplicateKey));
  const reasons: string[] = [];
  const promotable: RadarItem[] = [];
  let blocked = 0;

  for (const row of holdingRows) {
    if (PROTECTED_STATUSES.has(row.status)) continue;
    const item = rowToIndexedItem(row);
    const nearPass = blockedKeys.has(nearDuplicateKey(row));
    const radarItem = enrichRadarItem({ item, context, currentBoard: activeBoard });
    if (nearPass) {
      blocked++;
      reasons.push(`${item.title}: held back because a near-duplicate was recently passed or archived.`);
      continue;
    }
    if (!isPromotableWhenUnderfilled(radarItem)) {
      blocked++;
      reasons.push(`${item.title}: not promoted (${promotionBlockReason(radarItem)}).`);
      continue;
    }
    promotable.push(radarItem);
  }

  const selected = selectDiverseRadarSet(promotable, 0, Math.min(slots, RADAR_ACTIVE_ITEM_LIMIT - activeRows.length));
  let promoted = 0;
  const promotedIds: string[] = [];
  for (const item of selected) {
    const payload = mergeRadarIntelligencePayload(item.item.rawPayload, item);
    const { error } = await supabase
      .from("surfaced_items")
      .update({
        destination: "radar",
        status: "shown",
        payload,
        score: item.score,
      })
      .eq("id", item.item.id)
      .eq("user_id", userId);
    if (!error) {
      promoted++;
      promotedIds.push(item.item.id);
      reasons.push(`${item.title}: promoted to Active Radar (${item.strongestAngle}).`);
    }
  }

  console.info("[radar.refill] holding promotion", {
    reviewed: holdingRows.length,
    promoted,
    blocked,
    slots,
    promotedIds,
    reasons,
  });

  return {
    reviewed: holdingRows.length,
    promoted,
    blocked,
    promoted_ids: promotedIds,
    reasons,
  };
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
    radar_disposition: item.radarDisposition,
    today_disposition: item.todayDisposition,
    plan_disposition: item.planDisposition,
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
      radar_disposition: item.radarDisposition,
      today_disposition: item.todayDisposition,
      plan_disposition: item.planDisposition,
      plan_readiness: item.planReadiness,
      council: item.decision,
    },
  } as Json;
}

function hasHardActiveBlock(item: RadarItem): boolean {
  return item.decision.negative_flags.some((flag) => HARD_ACTIVE_BLOCK_FLAGS.has(flag));
}

function promotionBlockReason(item: RadarItem): string {
  if (item.radarDisposition !== "active") return `radar disposition ${item.radarDisposition}`;
  if (item.score < RADAR_UNDERFILLED_PROMOTION_FLOOR) return `score ${item.score.toFixed(2)} below underfilled floor`;
  if (item.confidence < RADAR_UNDERFILLED_PROMOTION_FLOOR) return `confidence ${item.confidence.toFixed(2)} below medium floor`;
  if (item.evidence.quality < 0.45) return "evidence is too light";
  if (hasHardActiveBlock(item)) return `blocking flags: ${item.decision.negative_flags.filter((flag) => HARD_ACTIVE_BLOCK_FLAGS.has(flag)).join(", ")}`;
  if (!item.title.trim()) return "missing clear title";
  if (!item.reasonSurfaced.trim()) return "missing surfaced reason";
  if (!item.strongestAngle.trim()) return "missing best move";
  return "not active-ready";
}

function nearDuplicateKey(row: SurfacedItemRow): string {
  const payload = isRecord(row.payload) ? row.payload : {};
  const intelligence = isRecord(payload.intelligence) ? payload.intelligence : {};
  const title = [
    stringValue(payload.move_title),
    stringValue(intelligence.move_title),
    row.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
  const source = row.url ?? row.source_id ?? row.source ?? "";
  return `${title}|${source}`.toLowerCase();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
