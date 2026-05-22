"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { assertQaToolsEnabled } from "@/lib/qa/gate";
import type {
  Json,
  PlanRow,
  SurfacedItemInsert,
  SurfacedItemRow,
} from "@/lib/types/database";

const QA_PREFIX = "[QA]";
const RADAR_TITLE = "[QA] Radar dinner idea";
const TODAY_TITLE = "[QA] Today errand";
const UPCOMING_TITLE = "[QA] Upcoming plan candidate";
const PLAN_TITLE = "[QA] Active plan fixture";
const PLAN_ITEM_TITLE = "[QA] Active plan source item";
const PLAN_SLUG = "qa-active-plan";

export async function createQaRadarItem() {
  const ownerId = await requireQaOwnerId();
  await deleteQaSurfacedItemsByTitle(ownerId, [RADAR_TITLE]);

  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  await insertSurface({
    user_id: ownerId,
    destination: "radar",
    source: "manual",
    type: "restaurant",
    category: "dining",
    title: RADAR_TITLE,
    subtitle: "Real Radar fixture",
    description:
      "A neutral dinner candidate used to verify Radar cards, item detail, and Save/Pass actions.",
    location_name: "QA Test Kitchen",
    starts_at: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    expires_at: expires.toISOString(),
    status: "shown",
    score: 0.82,
    reasons: [
      "QA fixture for the authenticated Radar surface.",
      "Useful for testing item detail and lifecycle actions.",
    ],
    tags: ["qa-fixture", "dining"],
    payload: qaPayload({
      fixture_type: "radar_item",
      reason: "Verify Radar renders database-backed cards.",
    }),
  });

  finishQaMutation();
}

export async function createQaTodayItem() {
  const ownerId = await requireQaOwnerId();
  await deleteQaSurfacedItemsByTitle(ownerId, [TODAY_TITLE]);

  const start = withTime(new Date(), 15, 30);
  await insertSurface({
    user_id: ownerId,
    destination: "today",
    source: "manual",
    type: "task",
    category: "errand",
    title: TODAY_TITLE,
    subtitle: "Real Today fixture",
    description:
      "A simple current-day errand used to verify the Today stack and item links.",
    location_name: "Near home",
    starts_at: start.toISOString(),
    status: "shown",
    score: 0.74,
    reasons: [
      "QA fixture for the Today stack.",
      "Happens today and should remain restrained.",
    ],
    tags: ["qa-fixture", "today"],
    payload: qaPayload({
      fixture_type: "today_item",
      reason: "Verify Today stack renders real surfaced_items.",
    }),
  });

  finishQaMutation();
}

export async function createQaUpcomingItem() {
  const ownerId = await requireQaOwnerId();
  await deleteQaSurfacedItemsByTitle(ownerId, [UPCOMING_TITLE]);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const start = withTime(tomorrow, 10, 0);
  await insertSurface({
    user_id: ownerId,
    destination: "upcoming",
    source: "manual",
    type: "recommendation",
    category: "planning",
    title: UPCOMING_TITLE,
    subtitle: "Real Upcoming fixture",
    description:
      "A future item used to verify the Upcoming bridge and Upcoming page.",
    starts_at: start.toISOString(),
    status: "shown",
    score: 0.7,
    reasons: [
      "QA fixture for upcoming surfaced data.",
      "Future dated so it can bridge from Today to Upcoming.",
    ],
    tags: ["qa-fixture", "upcoming"],
    payload: qaPayload({
      fixture_type: "upcoming_item",
      reason: "Verify Upcoming bridge/page links.",
    }),
  });

  finishQaMutation();
}

export async function createQaActivePlanFixture() {
  const ownerId = await requireQaOwnerId();
  await clearQaPlanFixture(ownerId);
  await deleteQaSurfacedItemsByTitle(ownerId, [PLAN_ITEM_TITLE]);

  const start = withTime(new Date(), 18, 0);
  const end = withTime(new Date(), 20, 0);
  const sourceItem = await insertSurface({
    user_id: ownerId,
    destination: "today",
    source: "manual",
    type: "plan",
    category: "planning",
    title: PLAN_ITEM_TITLE,
    subtitle: "Real active-plan source fixture",
    description:
      "Source item for a generated active plan fixture used by Today and plan routes.",
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    status: "planned",
    score: 0.88,
    reasons: [
      "QA fixture for the active generated plan lifecycle.",
      "Linked to a real plan row and timeline rows.",
    ],
    tags: ["qa-fixture", "plan"],
    payload: qaPayload({
      fixture_type: "active_plan_source",
      plan_slug: PLAN_SLUG,
      plan_status: "active",
    }),
  });

  const supabase = await getServerSupabase();
  const { data: planData, error: planError } = await supabase
    .from("plans")
    .insert({
      user_id: ownerId,
      title: PLAN_TITLE,
      category: "general",
      date: formatDateLabel(start),
      location_line: "QA route",
      summary:
        "Active fixture used to verify Today Live Plan, Next Move, and generated plan routes.",
      live_enabled: true,
      live_label: "LIVE",
      status: "active",
      quote_card: {} as Json,
      key_stats: qaPayload({
        slug: PLAN_SLUG,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        source_item_id: sourceItem.id,
        source_item_type: "plan",
        source_item_category: "planning",
        plan_type: "general",
        start_window: "6:00 PM",
        end_window: "8:00 PM",
        grab_list: [
          { label: "Wallet", reason: "Basic carry" },
          { label: "Keys", reason: "Return home cleanly" },
        ],
      }),
    })
    .select("*")
    .single();
  if (planError || !planData) {
    throw new Error(planError?.message ?? "QA plan insert failed.");
  }
  const plan = planData as PlanRow;

  const { error: sectionsError } = await supabase.from("plan_sections").insert([
    {
      user_id: ownerId,
      plan_id: plan.id,
      section_id: "why",
      title: "Why this exists",
      subtitle: "QA fixture",
      content: {
        body: "A compact active plan that exercises the generated-plan route without relying on external APIs.",
        bullets: ["Real plan row", "Real sections", "Real timeline rows"],
      } as Json,
      sort_order: 10,
    },
    {
      user_id: ownerId,
      plan_id: plan.id,
      section_id: "move",
      title: "The move",
      subtitle: "Keep it simple",
      content: {
        body: "Open the plan, inspect the timeline, then complete or cancel it from the plan page.",
        bullets: ["Open from Today", "Confirm source link", "Run lifecycle action"],
      } as Json,
      sort_order: 20,
    },
    {
      user_id: ownerId,
      plan_id: plan.id,
      section_id: "notes",
      title: "Cleanup",
      subtitle: "Owner-only",
      content: {
        body: "Use Clear QA fixtures from /account/qa to remove this plan and its linked rows.",
        bullets: [],
      } as Json,
      sort_order: 30,
    },
  ]);
  if (sectionsError) throw new Error(sectionsError.message);

  const { error: timelineError } = await supabase
    .from("today_timeline_items")
    .insert([
      {
        user_id: ownerId,
        plan_id: plan.id,
        time: "Now",
        title: "[QA] Open the fixture plan",
        status: "active",
        expandable: true,
        details: "This row should drive Today Next Move.",
        sort_order: 10,
      },
      {
        user_id: ownerId,
        plan_id: plan.id,
        time: "Next",
        title: "[QA] Confirm route links",
        status: "pending",
        expandable: true,
        details: "Use this to verify /plan/[slug] and /item/[id].",
        sort_order: 20,
      },
      {
        user_id: ownerId,
        plan_id: plan.id,
        time: "After",
        title: "[QA] Complete or cancel",
        status: "pending",
        expandable: false,
        details: null,
        sort_order: 30,
      },
    ]);
  if (timelineError) throw new Error(timelineError.message);

  const { error: updateItemError } = await supabase
    .from("surfaced_items")
    .update({
      payload: qaPayload({
        fixture_type: "active_plan_source",
        plan_id: plan.id,
        plan_slug: PLAN_SLUG,
        plan_status: "active",
      }),
    })
    .eq("id", sourceItem.id)
    .eq("user_id", ownerId);
  if (updateItemError) throw new Error(updateItemError.message);

  finishQaMutation();
}

export async function clearQaFixtures() {
  const ownerId = await requireQaOwnerId();
  await clearAllQaFixtures(ownerId);
  finishQaMutation();
}

async function requireQaOwnerId(): Promise<string> {
  assertQaToolsEnabled();
  const owner = await requireOwner();
  return owner.id;
}

async function insertSurface(
  input: SurfacedItemInsert,
): Promise<SurfacedItemRow> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("surfaced_items")
    .insert({
      ...input,
      source_id: input.source_id ?? null,
      address: input.address ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      url: input.url ?? null,
      image_url: input.image_url ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "QA surfaced item insert failed.");
  }
  return data as SurfacedItemRow;
}

async function clearAllQaFixtures(ownerId: string): Promise<void> {
  const supabase = await getServerSupabase();
  const planIds = await listQaPlanIds(ownerId);
  await deleteQaPlansByIds(ownerId, planIds);

  const { error: qaTimelineTitleError } = await supabase
    .from("today_timeline_items")
    .delete()
    .eq("user_id", ownerId)
    .ilike("title", `${QA_PREFIX}%`);
  if (qaTimelineTitleError) throw new Error(qaTimelineTitleError.message);

  const { error: qaItemsError } = await supabase
    .from("surfaced_items")
    .delete()
    .eq("user_id", ownerId)
    .ilike("title", `${QA_PREFIX}%`);
  if (qaItemsError) throw new Error(qaItemsError.message);
}

async function clearQaPlanFixture(ownerId: string): Promise<void> {
  const planIds = await listQaPlanIds(ownerId);
  await deleteQaPlansByIds(ownerId, planIds);
}

async function listQaPlanIds(ownerId: string): Promise<string[]> {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("plans")
    .select("id")
    .eq("user_id", ownerId)
    .ilike("title", `${QA_PREFIX}%`);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function deleteQaPlansByIds(
  ownerId: string,
  planIds: string[],
): Promise<void> {
  if (planIds.length === 0) return;
  const supabase = await getServerSupabase();
  const { error: timelineError } = await supabase
    .from("today_timeline_items")
    .delete()
    .eq("user_id", ownerId)
    .in("plan_id", planIds);
  if (timelineError) throw new Error(timelineError.message);

  const { error: sectionsError } = await supabase
    .from("plan_sections")
    .delete()
    .eq("user_id", ownerId)
    .in("plan_id", planIds);
  if (sectionsError) throw new Error(sectionsError.message);

  const { error: planError } = await supabase
    .from("plans")
    .delete()
    .eq("user_id", ownerId)
    .in("id", planIds);
  if (planError) throw new Error(planError.message);
}

async function deleteQaSurfacedItemsByTitle(
  ownerId: string,
  titles: string[],
): Promise<void> {
  if (titles.length === 0) return;
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("surfaced_items")
    .delete()
    .eq("user_id", ownerId)
    .in("title", titles);
  if (error) throw new Error(error.message);
}

function qaPayload(extra: Record<string, unknown> = {}): Json {
  return {
    qa_fixture: true,
    created_by: "qa_seed",
    ...extra,
  } as Json;
}

function withTime(date: Date, hours: number, minutes: number): Date {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function finishQaMutation(): never {
  revalidatePath("/");
  revalidatePath("/radar");
  revalidatePath("/upcoming");
  revalidatePath("/account/qa");
  revalidatePath("/account/history");
  redirect("/account/qa");
}
