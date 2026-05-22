"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { recordBehaviorSignal } from "@/lib/memory/behaviorSignals";
import { getIndexItem } from "@/lib/index/repo";
import { generatePlanFromItem } from "@/lib/brain/planGenerator";
import { slugify, type GeneratedPlan } from "@/lib/brain/planTypes";
import type { Json, PlanRow } from "@/lib/types/database";

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
  reused?: boolean;
};

/**
 * Generate a plan from a source IndexedItem.
 *
 * - If item already has `payload.plan_id` and the plan still exists,
 *   returns it without regenerating (unless `force=true`).
 * - Writes plans row + plan_sections rows + optional timeline items.
 * - Updates source item: status="planned", destination inferred from date,
 *   payload.plan_id / plan_slug / plan_status="draft".
 * - Records plan.generated behavior signal.
 */
export async function generatePlanForItem(input: {
  itemId: string;
  force?: boolean;
}): Promise<GeneratePlanForItemResult> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();

  const item = await getIndexItem(input.itemId);
  if (!item) throw new Error("Item not found.");

  // Reuse existing plan unless force=true
  if (!input.force) {
    const existing = readExistingPlan(item);
    if (existing?.planId) {
      const { data: existingRow } = await supabase
        .from("plans")
        .select("id,status,key_stats")
        .eq("id", existing.planId)
        .eq("user_id", owner.id)
        .maybeSingle();
      if (existingRow) {
        const planRow = existingRow as { id: string; status: string; key_stats: Json };
        const slug =
          existing.planSlug ?? readSlugFromKeyStats(planRow.key_stats) ?? slugify(item.title);
        return {
          ok: true,
          planId: planRow.id,
          planSlug: slug,
          status: planRow.status,
          fallbackUsed: false,
          reused: true,
        };
      }
    }
  }

  // Run generator
  const { plan, fallbackUsed } = await generatePlanFromItem({ item });

  // Ensure slug uniqueness per-user — append item id suffix if needed
  const uniqueSlug = await ensureUniqueSlug(owner.id, plan.slug, item.id);

  // Insert plan row
  const keyStats: Record<string, unknown> = {
    slug: uniqueSlug,
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

  const dateLabel = formatDateLabel(plan.starts_at);

  const { data: planInsert, error: planError } = await supabase
    .from("plans")
    .insert({
      user_id: owner.id,
      title: plan.title,
      category: plan.plan_type,
      date: dateLabel,
      location_line:
        plan.location_name ??
        item.locationName ??
        plan.address ??
        item.address ??
        null,
      summary: plan.hero_angle,
      live_enabled: false,
      live_label: plan.starts_at && isFutureOrToday(plan.starts_at)
        ? "UPCOMING"
        : "BEGIN",
      key_stats: keyStats as Json,
      quote_card: {} as Json,
      status: "draft",
    })
    .select("id")
    .single();
  if (planError || !planInsert) {
    throw new Error(planError?.message ?? "Plan insert failed");
  }
  const planId = (planInsert as { id: string }).id;

  // Insert sections
  const sections = plan.sections.map((s, idx) => ({
    user_id: owner.id,
    plan_id: planId,
    section_id: s.section_type,
    title: s.title,
    subtitle: s.subtitle ?? null,
    icon: null as string | null,
    content: {
      key: s.key,
      body: s.body,
      bullets: s.bullets ?? [],
    } as Json,
    sort_order: s.sort_order ?? idx * 10,
  }));

  if (sections.length > 0) {
    const { error: sectionsError } = await supabase
      .from("plan_sections")
      .insert(sections);
    if (sectionsError) {
      console.error("[plan.generate] sections insert", sectionsError);
    }
  }

  // Insert timeline items if any
  if (plan.timeline.length > 0) {
    const timelineRows = plan.timeline.map((t, idx) => ({
      user_id: owner.id,
      plan_id: planId,
      time: t.starts_at
        ? formatTimeLabel(t.starts_at)
        : t.time_label ?? "—",
      title: t.title,
      status: "pending",
      expandable: Boolean(t.description),
      details: t.description ?? null,
      sort_order: t.sort_order ?? idx * 10,
    }));
    const { error: timelineError } = await supabase
      .from("today_timeline_items")
      .insert(timelineRows);
    if (timelineError) {
      console.error("[plan.generate] timeline insert", timelineError);
    }
  }

  // Update source item: status=planned, destination inferred, payload patched
  const currentPayload = isRecord(item.rawPayload) ? item.rawPayload : {};
  const nextDestination = inferItemDestination(plan.starts_at);
  const nextPayload: Json = {
    ...currentPayload,
    plan_id: planId,
    plan_slug: uniqueSlug,
    plan_status: "draft",
    plan_type: plan.plan_type,
    plan_primary_move: plan.primary_move,
  } as Json;

  const { error: itemError } = await supabase
    .from("surfaced_items")
    .update({
      status: "planned",
      destination: nextDestination,
      payload: nextPayload,
    })
    .eq("id", item.id)
    .eq("user_id", owner.id);
  if (itemError) {
    console.error("[plan.generate] item update", itemError);
  }

  await recordBehaviorSignal({
    type: "plan.generated",
    planId,
    itemId: item.id,
    fallbackUsed,
  });

  revalidatePath(`/item/${item.id}`);
  revalidatePath(`/plan/${uniqueSlug}`);
  revalidatePath(`/upcoming`);
  revalidatePath(`/`);

  return {
    ok: true,
    planId,
    planSlug: uniqueSlug,
    status: "draft",
    fallbackUsed,
  };
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
    })
    .eq("id", input.planId)
    .eq("user_id", owner.id);
  if (planError) throw new Error(planError.message);

  const sourceItemId = readSourceItemId(plan.key_stats);
  if (sourceItemId) {
    const startsAt = readStartsAt(plan.key_stats);
    const item = await getIndexItem(sourceItemId);
    const currentPayload = item && isRecord(item.rawPayload) ? item.rawPayload : {};
    const nextPayload: Json = {
      ...currentPayload,
      plan_status: "cancelled",
    } as Json;
    // Item drops back to the appropriate non-live surface after cancellation.
    await supabase
      .from("surfaced_items")
      .update({
        status: "discovered",
        destination: inferItemDestination(startsAt),
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
