import type { Json } from "@/lib/types/database";
import type { IndexedItem } from "@/lib/index/types";
import type { RadarItem } from "@/lib/intelligence/types";

export type RadarMove = {
  id: string;
  sourceItemId: string;
  sourceLayer: "holding" | "current_events" | "places_library" | "candidate_inbox";
  title: string;
  moveTitle: string;
  moveSummary: string;
  whyThis: string;
  whyNow?: string;
  bestFor?: string[];
  timingWindow?: string;
  friction?: string[];
  estimatedCost?: string;
  locationLabel?: string;
  sourceUrl?: string;
  imageUrl?: string;
  confidence: number;
  freshnessScore?: number;
  tasteFitScore?: number;
  intentState?: string;
  status: "active" | "holding" | "later" | "watching" | "archived";
};

export function composeRadarMove(
  radar: RadarItem,
  options: {
    sourceLayer?: RadarMove["sourceLayer"];
    now?: string;
  } = {},
): RadarMove {
  const item = radar.item;
  const payload = asRecord(item.rawPayload);
  const intent = asRecord(payload.intent);
  const moveTitle = cleanMoveTitle(
    stringValue(payload.move_title) ??
    stringValue(asRecord(payload.intelligence).move_title) ??
    radar.title ??
    item.title,
    item,
  );
  const moveSummary = cleanSentence(
    radar.reasonSurfaced ||
    item.description ||
    item.subtitle ||
    `${moveTitle} is worth a closer look right now.`,
  );
  const whyNow = cleanOptional(
    radar.strongestAngle ||
    stringValue(payload.why_now) ||
    timingLine(item),
  );
  const bestFor = bestForFrom(radar, item);
  const friction = frictionFrom(radar, item);
  return {
    id: `move:${item.id}`,
    sourceItemId: item.id,
    sourceLayer: options.sourceLayer ?? "holding",
    title: item.title,
    moveTitle,
    moveSummary,
    whyThis: moveSummary,
    whyNow,
    bestFor,
    timingWindow: timingLine(item),
    friction,
    estimatedCost: spendLabel(radar),
    locationLabel: item.locationName ?? item.address ?? undefined,
    sourceUrl: item.url,
    imageUrl: item.imageUrl,
    confidence: clamp01(radar.confidence),
    freshnessScore: freshnessScore(item, options.now),
    tasteFitScore: clamp01(radar.scoreBreakdown.tasteFit),
    intentState: typeof intent.state === "string" ? intent.state : undefined,
    status: radar.radarDisposition === "active" ? "active" : "holding",
  };
}

export function radarMovePayload(move: RadarMove): Json {
  return {
    id: move.id,
    source_item_id: move.sourceItemId,
    source_layer: move.sourceLayer,
    title: move.title,
    move_title: move.moveTitle,
    move_summary: move.moveSummary,
    why_this: move.whyThis,
    why_now: move.whyNow,
    best_for: move.bestFor,
    timing_window: move.timingWindow,
    friction: move.friction,
    estimated_cost: move.estimatedCost,
    location_label: move.locationLabel,
    source_url: move.sourceUrl,
    image_url: move.imageUrl,
    confidence: move.confidence,
    freshness_score: move.freshnessScore,
    taste_fit_score: move.tasteFitScore,
    intent_state: move.intentState,
    status: move.status,
  };
}

export function humanOperationLabel(operation: string | null | undefined): string {
  switch (operation) {
    case "foundation_build_mode":
      return "Building the intelligence bank";
    case "source_building_campaign":
      return "Testing sources";
    case "candidate_inbox_build":
      return "Finding new options";
    case "library_build":
    case "library_refresh":
      return "Building the city map";
    case "event_pulse_build":
      return "Checking upcoming events";
    case "promotion_review":
      return "Reviewing what is ready for Radar";
    case "front_room_refill":
      return "Refreshing Radar";
    case "holding_build":
      return "Preparing strong maybes";
    case "source_recheck":
    case "source_expansion":
      return "Rechecking sources";
    case "stale_cleanup":
      return "Cleaning stale moves";
    case "no_op":
      return "Idle";
    default:
      return operation ? operation.replace(/_/g, " ") : "Idle";
  }
}

function cleanMoveTitle(value: string, item: IndexedItem): string {
  const cleaned = value
    .replace(/\b(candidate inbox|source graph|holding|eligible|promote_candidate|foundation sprint)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const title = cleaned || item.title || "Move worth considering";
  const prefix = title.length > 56 ? title.slice(0, 55).trim() : title;
  return titleCase(prefix);
}

function cleanSentence(value: string): string {
  return value
    .replace(/\b(candidate inbox|source graph|holding|eligible|promote_candidate|foundation sprint)\b/gi, "Jarvis")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOptional(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  return cleanSentence(value);
}

function bestForFrom(radar: RadarItem, item: IndexedItem): string[] {
  const blob = `${radar.category} ${radar.vibe} ${item.title} ${item.tags.join(" ")}`.toLowerCase();
  const out: string[] = [];
  if (/family|white sox|birthday|community/.test(blob)) out.push("family");
  if (/date|dinner|lounge|wine|restaurant/.test(blob)) out.push("one-on-one");
  if (/solo|walk|cigar|reset/.test(blob)) out.push("solo reset");
  if (/pickleball|basketball|sport|horse|outdoor|trail/.test(blob)) out.push("small group");
  if (/culture|gallery|studio|music|jazz|creative/.test(blob)) out.push("culture mood");
  return out.slice(0, 3);
}

function frictionFrom(radar: RadarItem, item: IndexedItem): string[] {
  const out = [...radar.missingInfo.slice(0, 2)];
  if (!item.startsAt && /event|music|culture/.test(`${item.type} ${item.category ?? ""}`.toLowerCase())) {
    out.push("confirm timing");
  }
  if (!item.locationName && !item.address) out.push("confirm location");
  return unique(out).slice(0, 3);
}

function spendLabel(radar: RadarItem): string | undefined {
  const spend = radar.item.briefing?.spending_posture;
  if (spend === "free") return "free";
  if (spend === "low") return "low";
  if (spend === "paid") return "paid";
  if (spend === "high") return "higher spend";
  return undefined;
}

function timingLine(item: IndexedItem): string | undefined {
  if (item.startsAt) return item.startsAt;
  if (/event|weekend|outdoor|activity|culture/.test(`${item.type} ${item.category ?? ""}`.toLowerCase())) {
    return "watch for the right window";
  }
  return undefined;
}

function freshnessScore(item: IndexedItem, now = new Date().toISOString()): number {
  const updated = Date.parse(item.updatedAt);
  const current = Date.parse(now);
  if (Number.isNaN(updated) || Number.isNaN(current)) return 0.5;
  const days = Math.max(0, (current - updated) / (24 * 60 * 60 * 1000));
  return clamp01(1 - days / 30);
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word, index) => {
      if (index > 0 && /^(and|or|the|of|for|in|at|to|a|an|with)$/i.test(word)) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
