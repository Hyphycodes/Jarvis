import "server-only";

import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { listIndexItems } from "@/lib/index/repo";
import { scoreIndexedItem } from "@/lib/scoring/scoreIndexedItem";
import type {
  CirclePersonRow,
  CircleUpdateRow,
  NorthPillarRow,
  NorthSignalRow,
  PlanRow,
  PlanSectionRow,
  SurfacedItemRow,
  TodayTimelineItemRow,
} from "@/lib/types/database";
import type {
  CirclePerson,
  CircleUpdate,
  GrabListItem,
  NorthPayload,
  NorthPillar,
  NorthSignal,
  PlanDetailPayload,
  PlanDetailSection,
  RadarCard,
  TodayPayload,
  TodayTimelineItem,
} from "@/lib/ai/types";
import type { IndexedItem } from "@/lib/index/types";

type Loader<T> = () => Promise<T>;

export const loadTodaySurface: Loader<TodayPayload> = async () => {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return emptyTodayPayload();

    const supabase = await getServerSupabase();
    const [timelineRes, primaryPlanRes, grabRes] = await Promise.all([
      supabase
        .from("today_timeline_items")
        .select("*")
        .eq("user_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("plans")
        .select("*")
        .eq("user_id", id)
        .order("updated_at", { ascending: false })
        .limit(1),
      supabase
        .from("surfaced_items")
        .select("*")
        .eq("user_id", id)
        .eq("destination", "today")
        .in("status", ["discovered", "shown", "saved", "planned"])
        .limit(8),
    ]);

    logQueryError("today.timeline", timelineRes.error);
    logQueryError("today.plan", primaryPlanRes.error);
    logQueryError("today.grabList", grabRes.error);

    const timelineRows = (timelineRes.data ?? []) as TodayTimelineItemRow[];
    const planRow = (primaryPlanRes.data?.[0] ?? null) as PlanRow | null;
    const grabRows = (grabRes.data ?? []) as SurfacedItemRow[];

    const timeline: TodayTimelineItem[] = timelineRows.map((row) => ({
      id: row.id,
      time: row.time,
      title: row.title,
      status: row.status as TodayTimelineItem["status"],
      planId: row.plan_id ?? undefined,
      expandable: row.expandable,
      details: row.details ?? undefined,
    }));

    const grabList: GrabListItem[] = grabRows.map((row) => ({
      id: row.id,
      label: row.title ?? "Item",
      checked: row.status === "completed",
      sourcePlanId:
        isRecord(row.payload) && typeof row.payload.plan_id === "string"
          ? row.payload.plan_id
          : undefined,
    }));

    return {
      hero: {
        eyebrow: "Today",
        date: formatToday(),
        greeting: planRow ? `Tonight: ${planRow.title}.` : "Quiet day.",
        summary: planRow?.summary ?? "Nothing strong enough to surface yet.",
        primaryPlanId: planRow?.id,
        leaveBy:
          isRecord(planRow?.key_stats) &&
          typeof planRow.key_stats.leave_by === "string"
            ? (planRow.key_stats.leave_by as string)
            : undefined,
      },
      timeline,
      grabList,
      livePlan: planRow
        ? {
            planId: planRow.id,
            label: planRow.live_label as "LIVE" | "BEGIN" | "UPCOMING",
            enabled: planRow.live_enabled,
          }
        : undefined,
    };
  } catch (error) {
    logSurfaceError("today", error);
    return emptyTodayPayload();
  }
};

export const loadRadarSurface: Loader<RadarCard[]> = async () => {
  try {
    const items = await listIndexItems({
      destination: "radar",
      status: ["discovered", "shown"],
    });
    return items.map(toRadarCard);
  } catch (error) {
    logSurfaceError("radar", error);
    return [];
  }
};

export const loadNorthSurface: Loader<NorthPayload> = async () => {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return emptyNorthPayload();

    const supabase = await getServerSupabase();
    const [pillarsRes, signalsRes] = await Promise.all([
      supabase
        .from("north_pillars")
        .select("*")
        .eq("user_id", id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("north_signals")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
    ]);

    logQueryError("north.pillars", pillarsRes.error);
    logQueryError("north.signals", signalsRes.error);

    const pillars: NorthPillar[] = ((pillarsRes.data ?? []) as NorthPillarRow[]).map(
      (row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        progress: row.progress ?? undefined,
        activeSignals: row.active_signals ?? [],
      }),
    );

    const signals: NorthSignal[] = ((signalsRes.data ?? []) as NorthSignalRow[]).map(
      (row) => ({
        id: row.id,
        pillarId: row.pillar_id ?? "",
        title: row.title,
        summary: row.summary,
        action: row.action ?? undefined,
        source: (row.source as NorthSignal["source"]) ?? "manual",
      }),
    );

    return {
      northStar: {
        title: pillars[0]?.title ?? "North",
        subtitle: pillars[0]?.description ?? "Long-term direction.",
      },
      pillars,
      signals,
    };
  } catch (error) {
    logSurfaceError("north", error);
    return emptyNorthPayload();
  }
};

export const loadCircleSurface: Loader<{
  people: CirclePerson[];
  updates: CircleUpdate[];
}> = async () => {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return { people: [], updates: [] };

    const supabase = await getServerSupabase();
    const [peopleRes, updatesRes] = await Promise.all([
      supabase
        .from("circle_people")
        .select("*")
        .eq("user_id", id)
        .order("closeness_score", { ascending: false }),
      supabase
        .from("circle_updates")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
    ]);

    logQueryError("circle.people", peopleRes.error);
    logQueryError("circle.updates", updatesRes.error);

    const people: CirclePerson[] = ((peopleRes.data ?? []) as CirclePersonRow[]).map(
      (row) => ({
        id: row.id,
        name: row.name,
        category: row.category as CirclePerson["category"],
        role: row.role ?? undefined,
        closenessScore: Number(row.closeness_score),
        lastInteraction: row.last_interaction ?? undefined,
        nextAction: row.next_action ?? undefined,
        currentThread: row.current_thread ?? undefined,
        notes: row.notes ?? [],
      }),
    );

    const updates: CircleUpdate[] = ((updatesRes.data ?? []) as CircleUpdateRow[]).map(
      (row) => ({
        id: row.id,
        personId: row.person_id ?? "",
        title: row.title,
        summary: row.summary,
        suggestedAction: row.suggested_action ?? undefined,
        urgency: row.urgency as CircleUpdate["urgency"],
        source: (row.source as CircleUpdate["source"]) ?? "manual",
        createdAt: row.created_at,
      }),
    );

    return { people, updates };
  } catch (error) {
    logSurfaceError("circle", error);
    return { people: [], updates: [] };
  }
};

export async function loadPlanDetail(
  planId: string,
): Promise<PlanDetailPayload | null> {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return null;

    const supabase = await getServerSupabase();
    const [planRes, sectionsRes] = await Promise.all([
      supabase
        .from("plans")
        .select("*")
        .eq("id", planId)
        .eq("user_id", id)
        .maybeSingle(),
      supabase
        .from("plan_sections")
        .select("*")
        .eq("plan_id", planId)
        .order("sort_order", { ascending: true }),
    ]);

    logQueryError("plan.detail", planRes.error);
    logQueryError("plan.sections", sectionsRes.error);

    const plan = planRes.data as PlanRow | null;
    if (!plan) return null;

    const sections: PlanDetailSection[] = ((sectionsRes.data ?? []) as PlanSectionRow[])
      .map((row) => ({
        id: row.section_id as PlanDetailSection["id"],
        title: row.title,
        subtitle: row.subtitle ?? "",
        icon: row.icon ?? "",
        content: row.content,
      }));

    const keyStats = isRecord(plan.key_stats) ? plan.key_stats : {};
    const quoteCard =
      isRecord(plan.quote_card) && typeof plan.quote_card.text === "string"
        ? {
            text: plan.quote_card.text,
            source:
              typeof plan.quote_card.source === "string"
                ? plan.quote_card.source
                : undefined,
          }
        : undefined;

    return {
      id: plan.id,
      category: plan.category ?? "plan",
      title: plan.title,
      date: plan.date ?? "",
      locationLine: plan.location_line ?? "",
      summary: plan.summary ?? "",
      liveState: {
        enabled: plan.live_enabled,
        label: plan.live_label as "LIVE" | "BEGIN" | "UPCOMING",
      },
      keyStats: {
        leaveBy: typeof keyStats.leave_by === "string" ? keyStats.leave_by : undefined,
        weather: typeof keyStats.weather === "string" ? keyStats.weather : undefined,
        parking: typeof keyStats.parking === "string" ? keyStats.parking : undefined,
        nearbyPerson:
          typeof keyStats.nearby_person === "string" ? keyStats.nearby_person : undefined,
      },
      sections,
      quoteCard,
    };
  } catch (error) {
    logSurfaceError("plan.detail", error);
    return null;
  }
}

export async function loadPlanBySlug(
  slug: string,
): Promise<PlanDetailPayload | null> {
  try {
    const { id } = await getViewableProfileId();
    if (!id) return null;
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .eq("user_id", id)
      .ilike("title", `${slug}%`)
      .order("updated_at", { ascending: false })
      .limit(1);
    logQueryError("plan.bySlug", error);
    const plan = (data?.[0] ?? null) as PlanRow | null;
    if (!plan) return null;
    return loadPlanDetail(plan.id);
  } catch (error) {
    logSurfaceError("plan.bySlug", error);
    return null;
  }
}

function toRadarCard(item: IndexedItem): RadarCard {
  const category = mapCategory(item.type, item.category);
  return {
    id: item.id,
    category,
    title: item.title,
    summary: item.description ?? item.subtitle ?? "",
    neighborhood: item.locationName ?? undefined,
    datetime: item.startsAt ?? undefined,
    imageUrl: item.imageUrl ?? undefined,
    score: item.score ?? scoreIndexedItem(item).total,

    whyItFits: item.reasons[0] ?? "Matches your taste profile.",
    whyNow: item.reasons[1] ?? "Available now.",
    actions: { save: true, pass: true, openPlan: false },
    routeOnSave: ["radar.saved"],
    routeOnPass: ["radar.passed"],
  };
}

function mapCategory(
  type: IndexedItem["type"],
  category: IndexedItem["category"],
): RadarCard["category"] {
  if (
    category === "dining" ||
    category === "events" ||
    category === "culture" ||
    category === "places" ||
    category === "sports" ||
    category === "music" ||
    category === "travel" ||
    category === "style" ||
    category === "opportunity"
  ) {
    return category;
  }
  switch (type) {
    case "restaurant":
      return "dining";
    case "event":
      return "events";
    case "culture":
      return "culture";
    case "place":
      return "places";
    case "product":
      return "style";
    case "travel":
      return "travel";
    case "style":
      return "style";
    case "creative":
      return "culture";
    default:
      return "opportunity";
  }
}

function emptyTodayPayload(): TodayPayload {
  return {
    hero: {
      eyebrow: "Today",
      date: formatToday(),
      greeting: "Quiet day.",
      summary: "Nothing strong enough to surface yet.",
    },
    timeline: [],
    grabList: [],
  };
}

function emptyNorthPayload(): NorthPayload {
  return {
    northStar: { title: "North", subtitle: "" },
    pillars: [],
    signals: [],
  };
}

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function logQueryError(scope: string, error: unknown) {
  if (!error) return;
  console.error("[surface-loader]", scope, error);
}

function logSurfaceError(scope: string, error: unknown) {
  console.error("[surface-loader]", scope, error);
}
