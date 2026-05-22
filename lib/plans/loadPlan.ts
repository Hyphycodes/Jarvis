/**
 * Load a generated plan by its slug (stored in plans.key_stats.slug).
 * Returns a structured payload built from plan_sections + today_timeline_items.
 */

import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { getViewableProfileId } from "@/lib/auth";
import type {
  Json,
  PlanRow,
  PlanSectionRow,
  TodayTimelineItemRow,
} from "@/lib/types/database";

export type LoadedPlanSection = {
  id: string;
  sectionType: string;
  title: string;
  subtitle?: string;
  body: string;
  bullets: string[];
  sortOrder: number;
};

export type LoadedPlanTimelineItem = {
  id: string;
  time: string;
  title: string;
  status: "pending" | "active" | "done" | "skipped";
  details?: string;
  sortOrder: number;
};

export type LoadedPlan = {
  id: string;
  title: string;
  subtitle?: string;
  slug: string;
  planType: string;
  status: "draft" | "active" | "completed" | "cancelled" | string;
  liveEnabled: boolean;
  liveLabel: string;
  dateLabel?: string;
  locationLine?: string;
  summary?: string;
  heroAngle?: string;
  whyThisFits?: string;
  bestWindow?: string;
  primaryMove?: string;
  effortLevel?: "low" | "medium" | "high";
  spendingPosture?: "free" | "low" | "paid" | "high" | "unknown";
  timeWindow?: string;
  locationName?: string;
  address?: string;
  sourceItemType?: string;
  confidence?: number;
  sourceItemId?: string;
  fallbackUsed: boolean;
  cautions: string[];
  grabList: Array<{ label: string; reason?: string }>;
  sections: LoadedPlanSection[];
  timeline: LoadedPlanTimelineItem[];
};

export async function loadPlanBySlugV2(slug: string): Promise<LoadedPlan | null> {
  try {
    const { id: userId } = await getViewableProfileId();
    if (!userId) return null;
    const supabase = await getServerSupabase();

    // Find plan by slug stored in key_stats jsonb
    const { data: plansData, error: plansError } = await supabase
      .from("plans")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (plansError) {
      console.error("[plan.loader] list plans", plansError);
      return null;
    }
    const planRow = ((plansData ?? []) as PlanRow[]).find(
      (p) => readSlug(p.key_stats) === slug,
    );
    if (!planRow) {
      return looksLikeUuid(slug) ? loadPlanByIdV2(slug) : null;
    }

    return loadPlanByRow(planRow);
  } catch (error) {
    console.error("[plan.loader] safe error", error);
    return null;
  }
}

export async function loadPlanByIdV2(planId: string): Promise<LoadedPlan | null> {
  try {
    const { id: userId } = await getViewableProfileId();
    if (!userId) return null;
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .eq("id", planId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[plan.loader] by id", error);
      return null;
    }
    if (!data) return null;
    return loadPlanByRow(data as PlanRow);
  } catch (error) {
    console.error("[plan.loader] by id safe error", error);
    return null;
  }
}

async function loadPlanByRow(planRow: PlanRow): Promise<LoadedPlan | null> {
  const supabase = await getServerSupabase();

  const [sectionsRes, timelineRes] = await Promise.all([
    supabase
      .from("plan_sections")
      .select("*")
      .eq("plan_id", planRow.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("today_timeline_items")
      .select("*")
      .eq("plan_id", planRow.id)
      .order("sort_order", { ascending: true }),
  ]);

  if (sectionsRes.error)
    console.error("[plan.loader] sections", sectionsRes.error);
  if (timelineRes.error)
    console.error("[plan.loader] timeline", timelineRes.error);

  const sections: LoadedPlanSection[] = (
    (sectionsRes.data ?? []) as PlanSectionRow[]
  ).map((row) => {
    const content = isRecord(row.content) ? row.content : {};
    const body =
      typeof content.body === "string" ? content.body : "";
    const bullets = Array.isArray(content.bullets)
      ? (content.bullets as unknown[]).filter(
          (b): b is string => typeof b === "string",
        )
      : [];
    return {
      id: row.id,
      sectionType: row.section_id,
      title: row.title,
      subtitle: row.subtitle ?? undefined,
      body,
      bullets,
      sortOrder: row.sort_order,
    };
  });

  const timeline: LoadedPlanTimelineItem[] = (
    (timelineRes.data ?? []) as TodayTimelineItemRow[]
  ).map((row) => ({
    id: row.id,
    time: row.time,
    title: row.title,
    status: row.status as LoadedPlanTimelineItem["status"],
    details: row.details ?? undefined,
    sortOrder: row.sort_order,
  }));

  const keyStats = isRecord(planRow.key_stats) ? planRow.key_stats : {};
  const slug = readSlug(planRow.key_stats) ?? planRow.id;

  return {
    id: planRow.id,
    title: planRow.title,
    subtitle: undefined,
    slug,
    planType:
      typeof keyStats.plan_type === "string"
        ? keyStats.plan_type
        : planRow.category ?? "general",
    status: planRow.status,
    liveEnabled: planRow.live_enabled,
    liveLabel: planRow.live_label,
    dateLabel: planRow.date ?? undefined,
    locationLine: planRow.location_line ?? undefined,
    summary: planRow.summary ?? undefined,
    heroAngle:
      typeof keyStats.hero_angle === "string"
        ? keyStats.hero_angle
        : planRow.summary ?? undefined,
    whyThisFits:
      typeof keyStats.why_this_fits === "string"
        ? keyStats.why_this_fits
        : undefined,
    bestWindow:
      typeof keyStats.best_window === "string"
        ? keyStats.best_window
        : undefined,
    primaryMove:
      typeof keyStats.primary_move === "string"
        ? keyStats.primary_move
        : undefined,
    effortLevel:
      isLevel(keyStats.effort_level) ? keyStats.effort_level : undefined,
    spendingPosture: isPosture(keyStats.spending_posture)
      ? keyStats.spending_posture
      : undefined,
    timeWindow: formatTimeWindow(keyStats.starts_at, keyStats.ends_at),
    locationName:
      typeof keyStats.location_name === "string"
        ? keyStats.location_name
        : undefined,
    address:
      typeof keyStats.address === "string" ? keyStats.address : undefined,
    sourceItemType:
      typeof keyStats.source_item_type === "string"
        ? keyStats.source_item_type
        : undefined,
    confidence:
      typeof keyStats.confidence === "number" ? keyStats.confidence : undefined,
    sourceItemId:
      typeof keyStats.source_item_id === "string"
        ? keyStats.source_item_id
        : undefined,
    fallbackUsed:
      typeof keyStats.fallback_used === "boolean"
        ? keyStats.fallback_used
        : false,
    cautions: readStringArray(keyStats.cautions),
    grabList: readGrabList(keyStats.grab_list),
    sections,
    timeline,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readSlug(keyStats: Json): string | undefined {
  if (!isRecord(keyStats)) return undefined;
  return typeof keyStats.slug === "string" ? keyStats.slug : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function readGrabList(value: unknown): Array<{ label: string; reason?: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ label: string; reason?: string }> = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const label = typeof entry.label === "string" ? entry.label : null;
    if (!label) continue;
    const reason = typeof entry.reason === "string" ? entry.reason : undefined;
    const item: { label: string; reason?: string } = reason
      ? { label, reason }
      : { label };
    out.push(item);
  }
  return out;
}

function isLevel(value: unknown): value is "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high";
}

function isPosture(
  value: unknown,
): value is "free" | "low" | "paid" | "high" | "unknown" {
  return value === "free" || value === "low" || value === "paid" || value === "high" || value === "unknown";
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatTimeWindow(startsAt: unknown, endsAt: unknown): string | undefined {
  const start = typeof startsAt === "string" ? formatTime(startsAt) : undefined;
  const end = typeof endsAt === "string" ? formatTime(endsAt) : undefined;
  if (start && end) return `${start}–${end}`;
  return start ?? end;
}

function formatTime(iso: string): string | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
