import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RADAR_ACTIVE_ITEM_LIMIT,
  RADAR_MIN_ACTIVE_ITEM_TARGET,
  RADAR_UNDERFILLED_PROMOTION_FLOOR,
} from "@/lib/brain/constants";
import { buildJarvisContext } from "@/lib/intelligence/context";
import { enrichRadarItem } from "@/lib/intelligence/core";
import { evaluateActiveRadarItem } from "@/lib/intelligence/radarFrontRoom";
import { isPromotableWhenUnderfilled } from "@/lib/intelligence/radarCurator";
import { readItemIntent } from "@/lib/items/intents";
import { rowToIndexedItem } from "@/lib/index/repo";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type {
  CurrentEventRow,
  PlacesLibraryRow,
  RadarCandidateInboxRow,
  SurfacedItemRow,
} from "@/lib/types/database";
import type { RadarItem } from "@/lib/intelligence/types";

export type PromotionSourceLayer =
  | "candidate_inbox"
  | "holding"
  | "places_library"
  | "current_events";

export type RadarPromotionNextStep =
  | "needs_enrichment"
  | "held"
  | "promote_candidate"
  | "reject"
  | "wait_for_timing";

export type RadarPromotionDiagnostic = {
  id: string;
  title: string;
  sourceLayer: PromotionSourceLayer;
  score: number | null;
  radarEligible: boolean;
  reason: string;
  blockers: string[];
  nextStep: RadarPromotionNextStep;
  updatedAt: string;
};

export type RadarPromotionDiagnostics = {
  activeCount: number;
  target: number;
  cap: number;
  summary: string;
  items: RadarPromotionDiagnostic[];
};

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

export async function readRadarPromotionDiagnostics(input: {
  userId: string;
  supabase?: SupabaseClient;
  limit?: number;
}): Promise<RadarPromotionDiagnostics> {
  const supabase = input.supabase ?? await getServerSupabase();
  const limit = input.limit ?? 24;
  const now = new Date().toISOString();
  const [
    activeRes,
    holdingRes,
    candidateRes,
    placesRes,
    eventsRes,
  ] = await Promise.all([
    supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", input.userId)
      .eq("destination", "radar")
      .in("status", ["shown", "opened"])
      .order("updated_at", { ascending: false })
      .limit(RADAR_ACTIVE_ITEM_LIMIT),
    supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", input.userId)
      .in("status", ["discovered", "shown", "opened"])
      .order("score", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("radar_candidate_inbox")
      .select("*")
      .eq("user_id", input.userId)
      .in("status", ["new", "evaluated", "library", "held", "rejected", "duplicate", "stale"])
      .order("score", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("places_library")
      .select("*")
      .eq("user_id", input.userId)
      .in("quality_tier", ["A", "B"])
      .order("quality_score", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(limit),
    supabase
      .from("current_events")
      .select("*")
      .eq("user_id", input.userId)
      .gte("starts_at", now)
      .in("status", ["pending", "verified", "surfaced"])
      .order("starts_at", { ascending: true })
      .limit(limit),
  ]);

  const activeRows = (activeRes.data ?? []) as SurfacedItemRow[];
  const holdingRows = ((holdingRes.data ?? []) as SurfacedItemRow[])
    .filter((row) => {
      if (row.destination === "radar" && (row.status === "shown" || row.status === "opened")) return false;
      if (row.status === "discovered") return true;
      return row.destination === "holding";
    });
  const activeItems = activeRows
    .map(rowToIndexedItem)
    .filter((item) => evaluateActiveRadarItem(item).allowed);
  const activeBoard = activeItems.map((item) => enrichRadarItem({ item }));
  const context = await buildJarvisContext({
    userId: input.userId,
    supabase,
    currentRadarItems: activeItems,
  });

  const holding = holdingRows.map((row) => {
    const item = rowToIndexedItem(row);
    const radar = enrichRadarItem({ item, context, currentBoard: activeBoard });
    return holdingDiagnostic(row, radar);
  });
  const candidates = ((candidateRes.data ?? []) as RadarCandidateInboxRow[]).map(candidateDiagnostic);
  const places = ((placesRes.data ?? []) as PlacesLibraryRow[]).map(placeDiagnostic);
  const events = ((eventsRes.data ?? []) as CurrentEventRow[]).map(eventDiagnostic);
  const items = [...holding, ...events, ...places, ...candidates]
    .sort((a, b) => Number(b.radarEligible) - Number(a.radarEligible) || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
  const eligible = items.filter((item) => item.radarEligible).length;
  return {
    activeCount: activeItems.length,
    target: RADAR_MIN_ACTIVE_ITEM_TARGET,
    cap: RADAR_ACTIVE_ITEM_LIMIT,
    summary: promotionSummary(activeRows.length, eligible, items.length),
    items,
  };
}

export function candidateDiagnostic(row: RadarCandidateInboxRow): RadarPromotionDiagnostic {
  const blockers = ["Raw Candidate Inbox rows never promote directly to Active Radar."];
  if (row.status === "new") blockers.push("Needs candidate evaluation.");
  if (row.status === "evaluated") blockers.push("Needs Library or Holding conversion before promotion.");
  if (row.status === "library") blockers.push("Converted to Library; needs timing/holding review.");
  if (row.status === "rejected" || row.status === "duplicate" || row.status === "stale") {
    blockers.push(row.rejection_reason ?? `Candidate status is ${row.status}.`);
  }
  if (!row.description?.trim()) blockers.push("Missing useful summary.");
  if (row.entity_type === "event" && !hasRawDate(row.raw_payload)) blockers.push("Missing exact event date/time.");
  return {
    id: row.id,
    title: row.title,
    sourceLayer: "candidate_inbox",
    score: row.score,
    radarEligible: false,
    reason: row.rejection_reason ?? reasonSummary(row.reason) ?? "Candidate is intake, not a front-room item.",
    blockers: unique(blockers),
    nextStep: row.status === "rejected" || row.status === "duplicate" || row.status === "stale"
      ? "reject"
      : "needs_enrichment",
    updatedAt: row.updated_at,
  };
}

function holdingDiagnostic(row: SurfacedItemRow, radar: RadarItem): RadarPromotionDiagnostic {
  const blockers = promotionBlockers(radar);
  const eligible = blockers.length === 0 && isPromotableWhenUnderfilled(radar);
  return {
    id: row.id,
    title: row.title ?? radar.title,
    sourceLayer: "holding",
    score: radar.score,
    radarEligible: eligible,
    reason: eligible
      ? `Ready for Active Radar review: ${radar.strongestAngle}`
      : `Held back: ${blockers[0] ?? "not active-ready"}.`,
    blockers,
    nextStep: eligible ? "promote_candidate" : "held",
    updatedAt: row.updated_at,
  };
}

function placeDiagnostic(row: PlacesLibraryRow): RadarPromotionDiagnostic {
  const score = row.quality_score ?? row.verdict_strength ?? null;
  const blockers = [
    "Durable Library place needs a timely reason before Radar.",
    row.address ? null : "Missing location/address enrichment.",
    score != null && score < RADAR_UNDERFILLED_PROMOTION_FLOOR ? "Below Radar confidence floor." : null,
  ].filter((value): value is string => Boolean(value));
  const strong = (row.quality_tier === "A" || row.quality_tier === "B") && (score ?? 0) >= RADAR_UNDERFILLED_PROMOTION_FLOOR;
  return {
    id: row.id,
    title: row.name,
    sourceLayer: "places_library",
    score,
    radarEligible: false,
    reason: strong
      ? "Strong Library context; should become Holding/Radar only when timing or plan context makes it useful now."
      : "Library place is useful context but not front-room ready.",
    blockers: unique(blockers),
    nextStep: strong ? "wait_for_timing" : "needs_enrichment",
    updatedAt: row.updated_at,
  };
}

function eventDiagnostic(row: CurrentEventRow): RadarPromotionDiagnostic {
  const score = row.quality_score ?? row.verdict_strength ?? null;
  const startsAt = new Date(row.starts_at);
  const daysAway = Number.isNaN(startsAt.getTime())
    ? null
    : Math.ceil((startsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const blockers = [
    score != null && score < RADAR_UNDERFILLED_PROMOTION_FLOOR ? "Below Radar confidence floor." : null,
    row.ticket_url ? null : "Missing ticket/source URL.",
    daysAway == null ? "Missing valid event timing." : null,
    daysAway != null && daysAway > 21 ? "Event is too far out for Active Radar." : null,
    row.status === "rejected" ? "Event rejected." : null,
  ].filter((value): value is string => Boolean(value));
  const eligible = blockers.length === 0 && (score ?? 0) >= RADAR_UNDERFILLED_PROMOTION_FLOOR;
  return {
    id: row.id,
    title: row.title,
    sourceLayer: "current_events",
    score,
    radarEligible: eligible,
    reason: eligible
      ? "Timely Event Pulse item is ready for Holding/Radar review."
      : "Event remains in Event Pulse until quality, timing, and source details are strong enough.",
    blockers,
    nextStep: eligible ? "promote_candidate" : "wait_for_timing",
    updatedAt: row.updated_at,
  };
}

function promotionBlockers(item: RadarItem): string[] {
  return [
    readItemIntent(item.item.rawPayload)?.state === "interested_later" ? "Owner marked this as interested later." : null,
    readItemIntent(item.item.rawPayload)?.state === "watching" ? "Owner is watching this lane; do not repeat unchanged item." : null,
    readItemIntent(item.item.rawPayload)?.state === "better_version" ? "Owner requested a better version of this lane." : null,
    readItemIntent(item.item.rawPayload)?.state === "muted" ? "Muted by owner intent." : null,
    item.radarDisposition !== "active" ? `Radar disposition is ${item.radarDisposition}.` : null,
    item.score < RADAR_UNDERFILLED_PROMOTION_FLOOR ? `Score ${item.score.toFixed(2)} is below underfilled floor ${RADAR_UNDERFILLED_PROMOTION_FLOOR}.` : null,
    item.confidence < RADAR_UNDERFILLED_PROMOTION_FLOOR ? `Confidence ${item.confidence.toFixed(2)} is below medium floor.` : null,
    item.evidence.quality < 0.45 ? "Evidence quality is too light." : null,
    !item.title.trim() ? "Missing clear title." : null,
    !item.category.trim() ? "Missing category." : null,
    !item.reasonSurfaced.trim() ? "Missing surfaced reason." : null,
    !item.strongestAngle.trim() ? "Missing best move." : null,
    ...item.decision.negative_flags
      .filter((flag) => HARD_ACTIVE_BLOCK_FLAGS.has(flag))
      .map((flag) => `Negative filter or hard block matched: ${flag}.`),
  ].filter((value): value is string => Boolean(value));
}

function promotionSummary(activeCount: number, eligible: number, reviewed: number): string {
  if (activeCount >= RADAR_MIN_ACTIVE_ITEM_TARGET && eligible === 0) {
    return `Active Radar has ${activeCount} item(s); reviewed ${reviewed} rows and found no better immediate promotion.`;
  }
  if (eligible > 0) {
    return `Reviewed ${reviewed} rows; ${eligible} item(s) look ready for conservative promotion review.`;
  }
  return `Active Radar has ${activeCount} item(s), but no reviewed item cleared the front-room gate yet.`;
}

function hasRawDate(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const direct = value.startsAt ?? value.starts_at;
  if (typeof direct === "string" && direct.trim()) return true;
  const payload = value.payload;
  if (!isRecord(payload)) return false;
  const dates = payload.dates;
  if (!isRecord(dates)) return false;
  const start = dates.start;
  return isRecord(start) && (
    (typeof start.dateTime === "string" && start.dateTime.trim().length > 0) ||
    (typeof start.localDate === "string" && start.localDate.trim().length > 0)
  );
}

function reasonSummary(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const summary = value.summary;
  if (typeof summary === "string" && summary.trim()) return summary.trim();
  return null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
