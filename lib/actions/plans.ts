"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { recordBehaviorSignal } from "@/lib/memory/behaviorSignals";
import { getIndexItem, rowToIndexedItem } from "@/lib/index/repo";
import { generatePlanFromItem } from "@/lib/brain/planGenerator";
import { slugify, type GeneratedPlan } from "@/lib/brain/planTypes";
import type { Json, PlanRow, SurfacedItemRow } from "@/lib/types/database";

// ── Existing actions (preserved) ────────────────────────────────────────────

export async function setPlanLive(input: {
  planId: string;
  enabled: boolean;
}): Promise<{ ok: true; enabled: boolean }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("plans")
    .update({
      live_enabled: input.enabled,
      live_label: input.enabled ? "LIVE" : "BEGIN",
    })
    .eq("id", input.planId)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);

  await recordBehaviorSignal(
    input.enabled
      ? { type: "plan.activate", planId: input.planId }
      : { type: "plan.cancel", planId: input.planId },
  );

  revalidatePath("/");
  revalidatePath(`/active/sparrow`);
  revalidatePath(`/plan/sparrow`);
  return { ok: true, enabled: input.enabled };
}

export async function completeTimelineItem(input: {
  timelineItemId: string;
}): Promise<{ ok: true }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("today_timeline_items")
    .update({ status: "done" })
    .eq("id", input.timelineItemId)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);

  await recordBehaviorSignal({
    type: "timeline.complete",
    itemId: input.timelineItemId,
  });

  revalidatePath("/");
  return { ok: true };
}

export async function toggleTimelineItem(input: {
  timelineItemId: string;
}): Promise<{ ok: true; status: "pending" | "done" }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const { data, error: loadError } = await supabase
    .from("today_timeline_items")
    .select("status")
    .eq("id", input.timelineItemId)
    .eq("user_id", owner.id)
    .maybeSingle();
  if (loadError) throw new Error(loadError.message);
  if (!data) throw new Error("Timeline item not found.");

  const currentStatus = (data as { status: string }).status;
  const nextStatus: "pending" | "done" =
    currentStatus === "done" ? "pending" : "done";
  const { error } = await supabase
    .from("today_timeline_items")
    .update({ status: nextStatus })
    .eq("id", input.timelineItemId)
    .eq("user_id", owner.id);
  if (error) throw new Error(error.message);

  if (nextStatus === "done") {
    await recordBehaviorSignal({
      type: "timeline.complete",
      itemId: input.timelineItemId,
    });
  }

  revalidatePath("/");
  return { ok: true, status: nextStatus };
}

// ── Plan generation (Sprint 3.1) ────────────────────────────────────────────

export type GeneratePlanForItemResult = {
  ok: true;
  planId: string;
  planSlug: string;
  status: "draft" | "active" | "completed" | "cancelled" | string;
  fallbackUsed: boolean;
  cancelled?: boolean;
  reused?: boolean;
};

export type CreateStubResult = {
  planId: string;
  planSlug: string;
  userId: string;
  reused: boolean;
};

/**
 * Create a plan shell immediately and return its id/slug. When the source item
 * already has a plan it is reused (unless `force`). Heavy generation is deferred
 * to fillPlan(), which can run in a background `after()` task.
 */
export async function createStubPlan(input: {
  itemId: string;
  force?: boolean;
  sourceObservationId?: string;
}): Promise<CreateStubResult> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  const item = await getIndexItem(input.itemId);
  if (!item) throw new Error("Item not found.");

  if (!input.force) {
    const existing = readExistingPlan(item);
    if (existing?.planId) {
      const { data: existingRow } = await supabase
        .from("plans")
        .select("id,key_stats")
        .eq("id", existing.planId)
        .eq("user_id", owner.id)
        .maybeSingle();
      if (existingRow) {
        const planRow = existingRow as { id: string; key_stats: Json };
        const slug =
          existing.planSlug ??
          readSlugFromKeyStats(planRow.key_stats) ??
          slugify(item.title);
        return {
          planId: planRow.id,
          planSlug: slug,
          userId: owner.id,
          reused: true,
        };
      }
    }
  }

  const slug = await ensureUniqueSlug(owner.id, slugify(item.title), item.id);

  const { data: planInsert, error: planError } = await supabase
    .from("plans")
    .insert({
      user_id: owner.id,
      title: item.title,
      category: item.category ?? null,
      location_line: item.locationName ?? item.address ?? null,
      live_enabled: false,
      live_label: "BEGIN",
      key_stats: {
        slug,
        source_item_id: item.id,
        source_item_type: item.type,
        source_item_category: item.category,
        source_observation_id: input.sourceObservationId ?? null,
      } as Json,
      quote_card: {} as Json,
      status: "draft",
      build_status: "building",
      source_observation_id: input.sourceObservationId ?? null,
    })
    .select("id")
    .single();
  if (planError || !planInsert) {
    throw new Error(planError?.message ?? "Plan insert failed");
  }
  const planId = (planInsert as { id: string }).id;

  // Point the source item at the new plan (date/destination set on schedule).
  const currentPayload = isRecord(item.rawPayload) ? item.rawPayload : {};
  const nextPayload: Json = {
    ...currentPayload,
    plan_id: planId,
    plan_slug: slug,
    plan_status: "draft",
    planning_state: "planning_in_progress",
    source_observation_id: input.sourceObservationId ?? currentPayload.source_observation_id ?? null,
  } as Json;
  await supabase
    .from("surfaced_items")
    .update({
      status: "planned",
      payload: nextPayload,
      planning_state: "planning_in_progress",
      source_observation_id: input.sourceObservationId ?? null,
    })
    .eq("id", item.id)
    .eq("user_id", owner.id);

  return { planId, planSlug: slug, userId: owner.id, reused: false };
}

/**
 * Fill a previously-created stub plan with generated sections. Uses the
 * service-role client so it is safe to run in a background `after()` task where
 * request cookies are no longer available. Sets build_status='ready' when done.
 */
export async function fillPlan(input: {
  planId: string;
  userId: string;
  itemId: string;
}): Promise<{ ok: true; fallbackUsed: boolean; cancelled?: boolean }> {
  const supabase = getSupabaseServiceClient();

  const before = await readPlanBuildState(supabase, input.planId, input.userId);
  if (isPlanBuildCancelled(before)) {
    return { ok: true, fallbackUsed: false, cancelled: true };
  }

  const { data: itemRow } = await supabase
    .from("surfaced_items")
    .select("*")
    .eq("id", input.itemId)
    .maybeSingle();
  if (!itemRow) throw new Error("Item not found.");
  const item = rowToIndexedItem(itemRow as SurfacedItemRow);

  const { plan, fallbackUsed } = await generatePlanFromItem({ item });

  const afterGeneration = await readPlanBuildState(supabase, input.planId, input.userId);
  if (isPlanBuildCancelled(afterGeneration)) {
    return { ok: true, fallbackUsed, cancelled: true };
  }

  // Preserve the slug chosen at stub time.
  const { data: stubRow } = await supabase
    .from("plans")
    .select("key_stats")
    .eq("id", input.planId)
    .maybeSingle();
  const stubSlug = readSlugFromKeyStats(
    (stubRow as { key_stats: Json } | null)?.key_stats ?? ({} as Json),
  );

  const keyStats: Record<string, unknown> = {
    slug: stubSlug ?? plan.slug,
    starts_at: plan.starts_at,
    ends_at: plan.ends_at,
    effort_level: plan.effort_level,
    spending_posture: plan.spending_posture,
    confidence: plan.confidence,
    hero_angle: plan.hero_angle,
    why_this_fits: plan.why_this_fits,
    best_window: plan.best_window,
    primary_move: plan.primary_move,
    location_name: plan.location_name,
    address: plan.address,
    plan_type: plan.plan_type,
    source_item_id: plan.source_item_id ?? item.id,
    source_item_type: item.type,
    source_item_category: item.category,
    fallback_used: fallbackUsed,
    cautions: plan.cautions ?? [],
    grab_list: plan.grab_list ?? [],
  };

  const { error: updateError } = await supabase
    .from("plans")
    .update({
      title: plan.title,
      category: plan.plan_type,
      date: formatDateLabel(plan.starts_at),
      location_line:
        plan.location_name ??
        item.locationName ??
        plan.address ??
        item.address ??
        null,
      summary: plan.hero_angle,
      live_label:
        plan.starts_at && isFutureOrToday(plan.starts_at) ? "UPCOMING" : "BEGIN",
      key_stats: keyStats as Json,
      build_status: "ready",
    })
    .eq("id", input.planId)
    .eq("user_id", input.userId);
  if (updateError) console.error("[fillPlan] plan update", updateError);

  // Sections
  const sections = plan.sections.map((s, idx) => ({
    user_id: input.userId,
    plan_id: input.planId,
    section_id: s.section_type,
    title: s.title,
    subtitle: s.subtitle ?? null,
    icon: null as string | null,
    content: { key: s.key, body: s.body, bullets: s.bullets ?? [] } as Json,
    sort_order: s.sort_order ?? idx * 10,
  }));
  if (sections.length > 0) {
    const { error } = await supabase.from("plan_sections").insert(sections);
    if (error) console.error("[fillPlan] sections insert", error);
  }

  // Timeline
  if (plan.timeline.length > 0) {
    const timelineRows = plan.timeline.map((t, idx) => ({
      user_id: input.userId,
      plan_id: input.planId,
      time: t.starts_at ? formatTimeLabel(t.starts_at) : t.time_label ?? "—",
      title: t.title,
      status: "pending",
      expandable: Boolean(t.description),
      details: t.description ?? null,
      sort_order: t.sort_order ?? idx * 10,
    }));
    const { error } = await supabase
      .from("today_timeline_items")
      .insert(timelineRows);
    if (error) console.error("[fillPlan] timeline insert", error);
  }

  // Mirror an inferred destination onto the source item (parity with legacy).
  await supabase
    .from("surfaced_items")
    .update({
      destination: inferItemDestination(plan.starts_at),
      planning_state: "planned",
    })
    .eq("id", input.itemId)
    .eq("user_id", input.userId);

  return { ok: true, fallbackUsed };
}

/**
 * Legacy synchronous path used by /api/items/[id]/generate-plan and radar
 * cards. Creates the stub and fills it inline.
 */
export async function generatePlanForItem(input: {
  itemId: string;
  force?: boolean;
}): Promise<GeneratePlanForItemResult> {
  const stub = await createStubPlan({
    itemId: input.itemId,
    force: input.force,
  });
  if (stub.reused) {
    return {
      ok: true,
      planId: stub.planId,
      planSlug: stub.planSlug,
      status: "draft",
      fallbackUsed: false,
      reused: true,
    };
  }

  const filled = await fillPlan({
    planId: stub.planId,
    userId: stub.userId,
    itemId: input.itemId,
  });

  await recordBehaviorSignal({
    type: "plan.generated",
    planId: stub.planId,
    itemId: input.itemId,
    fallbackUsed: filled.fallbackUsed,
  });

  revalidatePath(`/item/${input.itemId}`);
  revalidatePath(`/plan/${stub.planSlug}`);
  revalidatePath(`/upcoming`);
  revalidatePath(`/`);

  return {
    ok: true,
    planId: stub.planId,
    planSlug: stub.planSlug,
    status: "draft",
    fallbackUsed: filled.fallbackUsed,
  };
}

/**
 * Persist the chosen schedule for a plan (from the date picker). Mirrors the
 * label/start time into key_stats + plans.date and moves the source item to the
 * right surface (today/upcoming/holding).
 */
export async function schedulePlan(input: {
  planId: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM (24h)
}): Promise<{ ok: true; startsAt: string }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  const { data: planData } = await supabase
    .from("plans")
    .select("*")
    .eq("id", input.planId)
    .eq("user_id", owner.id)
    .maybeSingle();
  const plan = planData as PlanRow | null;
  if (!plan) throw new Error("Plan not found.");

  const startsAt = new Date(
    `${input.scheduledDate}T${input.scheduledTime}:00`,
  ).toISOString();

  const nextKeyStats: Json = {
    ...(isRecord(plan.key_stats) ? plan.key_stats : {}),
    starts_at: startsAt,
  } as Json;

  const { error: planError } = await supabase
    .from("plans")
    .update({
      scheduled_date: input.scheduledDate,
      scheduled_time: input.scheduledTime,
      date: formatDateLabel(startsAt),
      live_label: isFutureOrToday(startsAt) ? "UPCOMING" : "BEGIN",
      key_stats: nextKeyStats,
    })
    .eq("id", input.planId)
    .eq("user_id", owner.id);
  if (planError) throw new Error(planError.message);

  const sourceItemId = readSourceItemId(plan.key_stats);
  if (sourceItemId) {
    await supabase
      .from("surfaced_items")
      .update({ destination: inferItemDestination(startsAt) })
      .eq("id", sourceItemId)
      .eq("user_id", owner.id);
    revalidatePath(`/item/${sourceItemId}`);
  }

  const slug = readSlugFromKeyStats(plan.key_stats);
  revalidatePath(`/`);
  revalidatePath(`/upcoming`);
  if (slug) revalidatePath(`/plan/${slug}`);

  return { ok: true, startsAt };
}

// ── Lifecycle actions ───────────────────────────────────────────────────────

export async function activatePlan(input: {
  planId: string;
}): Promise<{ ok: true; status: "active" }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  const { data: planData } = await supabase
    .from("plans")
    .select("*")
    .eq("id", input.planId)
    .eq("user_id", owner.id)
    .maybeSingle();
  const plan = planData as PlanRow | null;
  if (!plan) throw new Error("Plan not found.");

  const { error: planError } = await supabase
    .from("plans")
    .update({
      status: "active",
      live_enabled: true,
      live_label: "LIVE",
    })
    .eq("id", input.planId)
    .eq("user_id", owner.id);
  if (planError) throw new Error(planError.message);

  // Update source item if linked
  const sourceItemId = readSourceItemId(plan.key_stats);
  if (sourceItemId) {
    const startsAt = readStartsAt(plan.key_stats);
    const nextDestination = startsAt
      ? inferItemDestination(startsAt)
      : "today";
    const item = await getIndexItem(sourceItemId);
    const currentPayload = item && isRecord(item.rawPayload) ? item.rawPayload : {};
    const nextPayload: Json = {
      ...currentPayload,
      plan_status: "active",
    } as Json;
    await supabase
      .from("surfaced_items")
      .update({
        destination: nextDestination,
        payload: nextPayload,
      })
      .eq("id", sourceItemId)
      .eq("user_id", owner.id);
  }

  await recordBehaviorSignal({ type: "plan.started", planId: input.planId });

  revalidatePath(`/`);
  revalidatePath(`/upcoming`);
  if (sourceItemId) revalidatePath(`/item/${sourceItemId}`);
  const slug = readSlugFromKeyStats(plan.key_stats);
  if (slug) revalidatePath(`/plan/${slug}`);

  return { ok: true, status: "active" };
}

export async function completePlan(input: {
  planId: string;
}): Promise<{ ok: true; status: "completed" }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  const { data: planData } = await supabase
    .from("plans")
    .select("*")
    .eq("id", input.planId)
    .eq("user_id", owner.id)
    .maybeSingle();
  const plan = planData as PlanRow | null;
  if (!plan) throw new Error("Plan not found.");

  const { error: planError } = await supabase
    .from("plans")
    .update({
      status: "completed",
      live_enabled: false,
      live_label: "BEGIN",
    })
    .eq("id", input.planId)
    .eq("user_id", owner.id);
  if (planError) throw new Error(planError.message);

  const sourceItemId = readSourceItemId(plan.key_stats);
  if (sourceItemId) {
    const item = await getIndexItem(sourceItemId);
    const currentPayload = item && isRecord(item.rawPayload) ? item.rawPayload : {};
    const nextPayload: Json = {
      ...currentPayload,
      plan_status: "completed",
    } as Json;
    await supabase
      .from("surfaced_items")
      .update({ status: "completed", payload: nextPayload })
      .eq("id", sourceItemId)
      .eq("user_id", owner.id);
  }

  await recordBehaviorSignal({
    type: "plan.completed",
    planId: input.planId,
  });

  revalidatePath(`/`);
  revalidatePath(`/account/history`);
  if (sourceItemId) revalidatePath(`/item/${sourceItemId}`);
  const slug = readSlugFromKeyStats(plan.key_stats);
  if (slug) revalidatePath(`/plan/${slug}`);

  return { ok: true, status: "completed" };
}

export async function cancelPlan(input: {
  planId: string;
}): Promise<{ ok: true; status: "cancelled" }> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  const { data: planData } = await supabase
    .from("plans")
    .select("*")
    .eq("id", input.planId)
    .eq("user_id", owner.id)
    .maybeSingle();
  const plan = planData as PlanRow | null;
  if (!plan) throw new Error("Plan not found.");

  const { error: planError } = await supabase
    .from("plans")
    .update({
      status: "cancelled",
      live_enabled: false,
      live_label: "BEGIN",
      build_status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", input.planId)
    .eq("user_id", owner.id);
  if (planError) throw new Error(planError.message);

  const sourceItemId = readSourceItemId(plan.key_stats);
  if (sourceItemId) {
    const item = await getIndexItem(sourceItemId);
    const currentPayload = item && isRecord(item.rawPayload) ? item.rawPayload : {};
    const nextPayload: Json = {
      ...currentPayload,
      plan_status: "cancelled",
      planning_state: "cancelled",
    } as Json;
    // Cancellation stops the build but keeps the source as a Radar maybe.
    await supabase
      .from("surfaced_items")
      .update({
        status: "shown",
        destination: "radar",
        planning_state: "cancelled",
        payload: nextPayload,
      })
      .eq("id", sourceItemId)
      .eq("user_id", owner.id);
  }

  await recordBehaviorSignal({
    type: "plan.cancelled",
    planId: input.planId,
  });

  revalidatePath(`/`);
  revalidatePath(`/upcoming`);
  revalidatePath(`/account/history`);
  if (sourceItemId) revalidatePath(`/item/${sourceItemId}`);
  const slug = readSlugFromKeyStats(plan.key_stats);
  if (slug) revalidatePath(`/plan/${slug}`);

  return { ok: true, status: "cancelled" };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type PlanBuildState = {
  status: string;
  build_status?: string | null;
  cancelled_at?: string | null;
} | null;

async function readPlanBuildState(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  planId: string,
  userId: string,
): Promise<PlanBuildState> {
  const { data } = await supabase
    .from("plans")
    .select("status,build_status,cancelled_at")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as PlanBuildState) ?? null;
}

function isPlanBuildCancelled(state: PlanBuildState): boolean {
  return Boolean(
    state &&
      (state.status === "cancelled" ||
        state.build_status === "cancelled" ||
        state.cancelled_at),
  );
}

async function ensureUniqueSlug(
  userId: string,
  baseSlug: string,
  itemId: string,
): Promise<string> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("plans")
    .select("key_stats")
    .eq("user_id", userId)
    .limit(200);

  const existing = new Set<string>();
  for (const row of (data ?? []) as Array<{ key_stats: Json }>) {
    const slug = readSlugFromKeyStats(row.key_stats);
    if (slug) existing.add(slug);
  }
  if (!existing.has(baseSlug)) return baseSlug;
  // Append item id suffix
  const suffixed = `${baseSlug}-${itemId.slice(0, 6)}`;
  if (!existing.has(suffixed)) return suffixed;
  // Walk numbers
  for (let i = 2; i < 50; i++) {
    const candidate = `${baseSlug}-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${baseSlug}-${Date.now().toString(36)}`;
}

function readExistingPlan(
  item: { rawPayload: Json },
): { planId?: string; planSlug?: string } | null {
  if (!isRecord(item.rawPayload)) return null;
  const planId = typeof item.rawPayload.plan_id === "string"
    ? item.rawPayload.plan_id
    : undefined;
  const planSlug = typeof item.rawPayload.plan_slug === "string"
    ? item.rawPayload.plan_slug
    : undefined;
  if (!planId) return null;
  return { planId, planSlug };
}

function readSlugFromKeyStats(keyStats: Json): string | undefined {
  if (!isRecord(keyStats)) return undefined;
  return typeof keyStats.slug === "string" ? keyStats.slug : undefined;
}

function readSourceItemId(keyStats: Json): string | undefined {
  if (!isRecord(keyStats)) return undefined;
  return typeof keyStats.source_item_id === "string"
    ? keyStats.source_item_id
    : undefined;
}

function readStartsAt(keyStats: Json): string | undefined {
  if (!isRecord(keyStats)) return undefined;
  return typeof keyStats.starts_at === "string" ? keyStats.starts_at : undefined;
}

function inferItemDestination(
  startsAt: string | undefined,
): "today" | "upcoming" | "holding" {
  if (!startsAt) return "holding";
  try {
    const d = new Date(startsAt);
    if (Number.isNaN(d.getTime())) return "holding";
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) return "today";
    if (d.getTime() >= Date.now()) return "upcoming";
    return "holding";
  } catch {
    return "holding";
  }
}

function isFutureOrToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return d.getTime() >= startOfToday.getTime();
  } catch {
    return false;
  }
}

function formatDateLabel(iso?: string): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

function formatTimeLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
