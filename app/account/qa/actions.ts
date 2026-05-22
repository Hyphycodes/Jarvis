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
const EVENT_TITLE = "[QA] Jazz room candidate";
const ACTIVITY_TITLE = "[QA] Riding lesson candidate";
const PRODUCT_TITLE = "[QA] Heritage jacket candidate";
const ARTICLE_TITLE = "[QA] Workshop idea article";
const TODAY_TITLE = "[QA] Today errand";
const UPCOMING_TITLE = "[QA] Upcoming plan candidate";
const PLAN_TITLE = "[QA] Active plan fixture";
const PLAN_ITEM_TITLE = "[QA] Active plan source item";
const PLAN_SLUG = "qa-active-plan";

export async function createQaRadarItem() {
  const ownerId = await requireQaOwnerId();
  await deleteQaSurfacedItemsByTitle(ownerId, [
    RADAR_TITLE,
    EVENT_TITLE,
    ACTIVITY_TITLE,
    PRODUCT_TITLE,
    ARTICLE_TITLE,
  ]);

  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const eventStart = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  eventStart.setHours(20, 0, 0, 0);
  const eventEnd = new Date(eventStart.getTime() + 2 * 60 * 60 * 1000);
  const activityStart = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  activityStart.setHours(10, 30, 0, 0);

  const fixtures: SurfacedItemInsert[] = [
    {
      user_id: ownerId,
      destination: "radar",
      source: "manual",
      type: "restaurant",
      category: "dining",
      title: RADAR_TITLE,
      subtitle: "Dinner consideration fixture",
      description:
        "A neutral dinner candidate used to verify Radar cards, item detail, and Save/Pass actions.",
      location_name: "QA Test Kitchen",
      address: "River North, Chicago, IL",
      lat: 41.8925,
      lng: -87.6269,
      starts_at: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      expires_at: expires.toISOString(),
      status: "shown",
      score: 0.82,
      reasons: [
        "QA fixture for the authenticated Radar surface.",
        "Useful for testing item detail and lifecycle actions.",
      ],
      tags: ["qa-fixture", "dining", "low-effort"],
      payload: qaPayload({
        fixture_type: "radar_place",
        source_title: "QA dining note",
        source_url: "https://example.com/qa-dining",
        briefing: qaBriefing({
          display_title: "[QA] Dinner consideration",
          display_category: "Dining",
          one_line: "A clean dinner lead for testing the Consideration Brief layout.",
          jarvis_take: "Strong fit, low friction. Save it if you want a simple evening option.",
          why_it_matters: "It checks the place, timing, location, and action modules without relying on live data.",
          why_now: "Good after-work window.",
          best_next_action: "save",
          confidence: 0.82,
          confidence_label: "high",
          effort_level: "low",
          spending_posture: "paid",
          suggested_destination: "radar",
          evidence_summary: "Owner-created QA source used for layout testing.",
          cleaned_tags: ["Dining", "Chicago", "Low Effort"],
        }),
      }),
    },
    {
      user_id: ownerId,
      destination: "radar",
      source: "manual",
      type: "event",
      category: "music",
      title: EVENT_TITLE,
      subtitle: "Event consideration fixture",
      description: "A live music candidate for event-specific timing and venue modules.",
      location_name: "QA Listening Room",
      address: "West Loop, Chicago, IL",
      lat: 41.8837,
      lng: -87.6488,
      starts_at: eventStart.toISOString(),
      ends_at: eventEnd.toISOString(),
      expires_at: eventStart.toISOString(),
      status: "shown",
      score: 0.76,
      reasons: ["QA event fixture.", "Verifies date, venue, and upcoming action."],
      tags: ["qa-fixture", "music", "event", "ticketed"],
      payload: qaPayload({
        fixture_type: "event_brief",
        source_title: "QA event source",
        source_url: "https://example.com/qa-event",
        briefing: qaBriefing({
          display_title: "[QA] Jazz room candidate",
          display_category: "Music",
          one_line: "A dated event lead for testing timing, venue, and planning actions.",
          jarvis_take: "Worth planning if the night is open. Good signal, clear window.",
          why_it_matters: "It verifies event flow without touching Ticketmaster or live sources.",
          why_now: "Weekend evening window.",
          best_next_action: "plan",
          confidence: 0.76,
          confidence_label: "high",
          effort_level: "medium",
          spending_posture: "paid",
          suggested_destination: "radar",
          evidence_summary: "QA event evidence with a known venue and time window.",
          cleaned_tags: ["Music", "Event", "Chicago"],
        }),
      }),
    },
    {
      user_id: ownerId,
      destination: "radar",
      source: "manual",
      type: "place",
      category: "activity",
      title: ACTIVITY_TITLE,
      subtitle: "Activity consideration fixture",
      description: "A horseback riding candidate for activity/location modules.",
      location_name: "QA Riding Barn",
      address: "Barrington, IL",
      lat: 42.1539,
      lng: -88.1362,
      starts_at: activityStart.toISOString(),
      status: "shown",
      score: 0.68,
      reasons: ["QA activity fixture.", "Verifies effort and map module."],
      tags: ["qa-fixture", "horseback", "activity", "medium-effort"],
      payload: qaPayload({
        fixture_type: "activity_brief",
        source_title: "QA activity source",
        source_url: "https://example.com/qa-activity",
        briefing: qaBriefing({
          display_title: "[QA] Riding lesson candidate",
          display_category: "Activity",
          one_line: "A place-based activity lead for testing distance, effort, and Holding decisions.",
          jarvis_take: "Good signal, not urgent. Better for a weekend than a workday.",
          why_it_matters: "It exercises outdoor/activity logic without pretending the timing is effortless.",
          why_now: "Better held until the right weekend.",
          best_next_action: "hold",
          confidence: 0.68,
          confidence_label: "medium",
          effort_level: "medium",
          spending_posture: "paid",
          suggested_destination: "holding",
          evidence_summary: "QA activity source with location data and a future window.",
          cleaned_tags: ["Activity", "Horseback Riding", "Weekend"],
        }),
      }),
    },
    {
      user_id: ownerId,
      destination: "radar",
      source: "manual",
      type: "product",
      category: "style",
      title: PRODUCT_TITLE,
      subtitle: "Product consideration fixture",
      description: "A style product candidate for product/source modules.",
      status: "shown",
      score: 0.72,
      url: "https://example.com/qa-style",
      image_url:
        "https://images.unsplash.com/photo-1516826957135-700dedea698c?auto=format&fit=crop&w=1200&q=80",
      reasons: ["QA product fixture.", "Verifies product and image rendering."],
      tags: ["qa-fixture", "style", "menswear", "paid"],
      payload: qaPayload({
        fixture_type: "product_brief",
        source_title: "QA style source",
        source_url: "https://example.com/qa-style",
        image_url:
          "https://images.unsplash.com/photo-1516826957135-700dedea698c?auto=format&fit=crop&w=1200&q=80",
        briefing: qaBriefing({
          display_title: "[QA] Heritage jacket candidate",
          display_category: "Style",
          one_line: "A product-style lead for testing image, source, spend, and save/hold actions.",
          jarvis_take: "Save for comparison. Strong fit, but not something to force.",
          why_it_matters: "It checks product behavior without pretending there is a reservation or event window.",
          best_next_action: "save",
          confidence: 0.72,
          confidence_label: "medium",
          effort_level: "low",
          spending_posture: "paid",
          suggested_destination: "radar",
          evidence_summary: "QA product source with image and clean style tags.",
          cleaned_tags: ["Style", "Menswear", "Heritage"],
        }),
      }),
    },
    {
      user_id: ownerId,
      destination: "holding",
      source: "manual",
      type: "recommendation",
      category: "creative",
      title: ARTICLE_TITLE,
      subtitle: "Article consideration fixture",
      description: "A source-only idea candidate for article and evidence modules.",
      status: "shown",
      score: 0.61,
      url: "https://example.com/qa-workshop-article",
      reasons: ["QA article fixture.", "Verifies source-led idea layout."],
      tags: ["qa-fixture", "creative", "article", "idea"],
      payload: qaPayload({
        fixture_type: "article_brief",
        source_title: "A practical workshop note for testing idea briefs",
        source_url: "https://example.com/qa-workshop-article",
        briefing: qaBriefing({
          display_title: "[QA] Workshop idea article",
          display_category: "Idea",
          one_line: "A source-led idea for testing article briefs without a location module.",
          jarvis_take: "Watch for stronger evidence. Good idea, needs a better source.",
          why_it_matters: "It validates article/idea pages where source evidence matters more than location.",
          best_next_action: "research",
          confidence: 0.61,
          confidence_label: "medium",
          effort_level: "low",
          spending_posture: "unknown",
          suggested_destination: "holding",
          quality_flags: ["needs_verification"],
          evidence_summary: "QA article evidence with no fake place or event data.",
          cleaned_tags: ["Creative", "Idea", "Research"],
        }),
      }),
    },
  ];

  for (const fixture of fixtures) {
    await insertSurface(fixture);
  }

  finishQaMutation();
}

function qaBriefing(
  input: Record<string, unknown> & {
    display_title: string;
    display_category: string;
    one_line: string;
    jarvis_take: string;
    why_it_matters: string;
    best_next_action: string;
    confidence: number;
    confidence_label: string;
    effort_level: string;
    spending_posture: string;
    suggested_destination: string;
    evidence_summary: string;
    cleaned_tags: string[];
  },
): Record<string, unknown> {
  return {
    quality_flags: [],
    ...input,
  };
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
