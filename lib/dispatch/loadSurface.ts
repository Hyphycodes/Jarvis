import "server-only";

import { getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { listIndexItems } from "@/lib/index/repo";
import { readBriefingFromPayload } from "@/lib/brain/briefingTypes";
import {
  buildConsiderationBrief,
  heroImageForItem,
  sourceDomainForItem,
} from "@/lib/items/considerationBrief";
import { scoreIndexedItem } from "@/lib/scoring/scoreIndexedItem";
import { findDayOfItems, MAX_DAY_OF_ON_TODAY } from "@/lib/scheduling/promoteItems";
import {
  DEFAULT_WEEKLY_RHYTHM,
  getDayRhythmState,
  normalizeWeeklyRhythm,
  type DayRhythmState,
  type WeeklyRhythm,
} from "@/lib/schedule/weeklyRhythm";
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
  OnDeckItem,
  PlanDetailPayload,
  PlanDetailSection,
  RadarCard,
  TodayCommandItem,
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
    const [timelineRes, primaryPlanRes, todayItemsRes, upcomingItemsRes, upcomingCountRes, dayOf, rhythmRes] =
      await Promise.all([
        supabase
          .from("today_timeline_items")
          .select("*")
          .eq("user_id", id)
          .order("sort_order", { ascending: true }),
        supabase
          .from("plans")
          .select("*")
          .eq("user_id", id)
          // Today live module is only for truly active generated plans.
          // Draft/completed/cancelled plans remain reachable through their
          // source item and plan route, but they are not "live right now".
          .not("status", "in", "(draft,completed,cancelled)")
          .or("status.eq.active,live_enabled.eq.true")
          .order("live_enabled", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1),
        supabase
          .from("surfaced_items")
          .select("*")
          .eq("user_id", id)
          .eq("destination", "today")
          .in("status", ["discovered", "shown", "opened", "saved", "planned"])
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order("starts_at", { ascending: true, nullsFirst: false })
          .order("score", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false })
          .limit(12),
        listUpcomingBridgeItems(id),
        // Count of upcoming items (saved/planned + future starts_at)
        countUpcoming(id),
        // Day-of items (read-only inclusion — no mutation here)
        findDayOfItems(id),
        supabase
          .from("founder_profile")
          .select("weekly_rhythm")
          .eq("user_id", id)
          .maybeSingle(),
      ]);

    logQueryError("today.timeline", timelineRes.error);
    logQueryError("today.plan", primaryPlanRes.error);
    logQueryError("today.items", todayItemsRes.error);
    logQueryError("today.rhythm", rhythmRes.error);

    const timelineRows = (timelineRes.data ?? []) as TodayTimelineItemRow[];
    const planRow = (primaryPlanRes.data?.[0] ?? null) as PlanRow | null;
    const planKeyStats = isRecord(planRow?.key_stats) ? planRow.key_stats : {};
    const weeklyRhythm = normalizeWeeklyRhythm(
      rhythmRes.data?.weekly_rhythm ?? DEFAULT_WEEKLY_RHYTHM,
    );
    const planSlug = planRow ? readSlugFromKeyStats(planRow.key_stats) : undefined;
    const activePlanId = planRow?.id;
    const todayRows = (todayItemsRes.data ?? []) as SurfacedItemRow[];
    const activePlanSourceRow = activePlanId
      ? todayRows.find((row) => readPlanId(row.payload) === activePlanId)
      : undefined;
    const activePlanDisplay = planRow
      ? buildPlanDisplay(planRow, planKeyStats, activePlanSourceRow)
      : null;
    const todayItems = todayRows
      .map(rowToTodayCommandItem)
      .filter((item) => !isLinkedToPlan(item, activePlanId));
    const upcomingItems = upcomingItemsRes.filter(
      (item) => !isLinkedToPlan(item, activePlanId),
    );

    const planTimelineRows = planRow
      ? timelineRows.filter((row) => row.plan_id === planRow.id)
      : timelineRows;
    const timeline: TodayTimelineItem[] = planTimelineRows.map((row) => ({
      id: row.id,
      time: row.time,
      title: cleanDisplayText(row.title) || activePlanDisplay?.title || "Plan",
      status: row.status as TodayTimelineItem["status"],
      planId: row.plan_id ?? undefined,
      planSlug: row.plan_id === planRow?.id ? planSlug : undefined,
      expandable: row.expandable || Boolean(row.details) || row.plan_id === planRow?.id,
      details: cleanDisplayText(row.details ?? undefined) ?? undefined,
      locationLine: row.plan_id === planRow?.id
        ? planRow.location_line ?? undefined
        : undefined,
      timingNote: row.plan_id === planRow?.id
        ? formatTimeWindow(
            typeof planKeyStats.starts_at === "string"
              ? planKeyStats.starts_at
              : undefined,
            typeof planKeyStats.ends_at === "string"
              ? planKeyStats.ends_at
              : undefined,
          ) ?? cleanDisplayText(
            typeof planKeyStats.best_window === "string"
              ? planKeyStats.best_window
              : undefined,
          )
        : undefined,
      prepNote: row.plan_id === planRow?.id
        ? cleanDisplayText(readFirstGrabListLabel(planKeyStats))
        : undefined,
      canPersistStatus: true,
    }));
    const activeTimeline = planRow && timeline.length === 0
      ? [fallbackTimelineForPlan(planRow, planKeyStats, planSlug, activePlanDisplay)]
      : timeline;

    const grabList: GrabListItem[] = planRow
      ? readPlanGrabList(planKeyStats).map((entry, idx) => ({
          id: `${planRow.id}-grab-${idx}`,
          label: entry,
          checked: false,
          sourcePlanId: planRow.id,
        }))
      : [];

    // Build on-deck list (max 3, no flood). Excludes items already in
    // the timeline (matched by title — best-effort dedupe).
    const timelineTitles = new Set(
      activeTimeline.map((r) => r.title?.toLowerCase().trim()).filter(Boolean),
    );
    const onDeck: OnDeckItem[] = dayOf.dayOf
      .filter((it) => !timelineTitles.has(it.title.toLowerCase().trim()))
      .filter((it) => readPlanId(it.rawPayload) !== activePlanId)
      .slice(0, MAX_DAY_OF_ON_TODAY)
      .map((it) => ({
        id: it.id,
        title: it.title,
        subtitle: it.subtitle,
        startsAt: it.startsAt,
        locationName: it.locationName,
        category: it.category ?? it.type,
        planId: readPlanId(it.rawPayload),
      }));
    const nextPlanTimelineItem = planRow
      ? activeTimeline.find((item) => item.planId === planRow.id && item.status !== "done")
      : undefined;
    const topTodayItem = todayItems[0];
    const firstUpcomingWithTime = upcomingItems.find((item) => item.startsAt);
    const nextMove = topTodayItem ?? (!planRow ? firstUpcomingWithTime : undefined);
    const todayStack = todayItems
      .filter((item) => item.id !== nextMove?.id)
      .slice(0, 6);
    const hero = buildTodayHero(planRow, planKeyStats, activePlanDisplay, weeklyRhythm);

    return {
      hero: {
        eyebrow: "Today",
        date: formatToday(),
        greeting: hero.greeting,
        summary: hero.summary,
        primaryPlanId: planRow?.id,
        leaveBy:
          isRecord(planRow?.key_stats) &&
          typeof planRow.key_stats.leave_by === "string"
            ? (planRow.key_stats.leave_by as string)
            : undefined,
      },
      timeline: activeTimeline,
      grabList,
      livePlan: planRow
        ? {
            planId: planRow.id,
            label: planRow.live_label as "LIVE" | "BEGIN" | "UPCOMING",
            enabled: planRow.live_enabled,
            title: activePlanDisplay?.title ?? cleanDisplayText(planRow.title) ?? "Active plan",
            slug: planSlug,
            status: planRow.status,
            summary: activePlanDisplay?.summary,
            locationLine: planRow.location_line ?? undefined,
            timeWindow: formatTimeWindow(
              typeof planKeyStats.starts_at === "string"
                ? planKeyStats.starts_at
                : undefined,
              typeof planKeyStats.ends_at === "string"
                ? planKeyStats.ends_at
                : undefined,
            ),
            sourceItemType:
              typeof planKeyStats.source_item_type === "string"
                ? planKeyStats.source_item_type
                : undefined,
            destination: "today",
            nextTimelineItem: nextPlanTimelineItem
              ? {
                  time: nextPlanTimelineItem.time,
                  title: nextPlanTimelineItem.title,
                }
              : undefined,
          }
        : undefined,
      onDeck: onDeck.length > 0 ? onDeck : undefined,
      upcomingCount: upcomingItems.length > 0 ? upcomingCountRes : 0,
      nextMove,
      todayStack: todayStack.length > 0 ? todayStack : undefined,
      upcoming: upcomingItems.slice(0, 3),
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
      status: ["discovered", "shown", "opened"],
      limit: 24,
    });
    return items
      .sort(compareRadarItems)
      .slice(0, 12)
      .map(toRadarCard);
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
  const planSlug = readPlanSlug(item.rawPayload);
  const briefing = item.briefing;
  const consideration = buildConsiderationBrief(item);
  return {
    id: item.id,
    source: item.source,
    type: item.type,
    status: item.status,
    destination: item.destination,
    planSlug,
    category,
    title: briefing?.display_title ?? item.title,
    summary: briefing?.one_line ?? item.description ?? item.subtitle ?? "",
    displayCategory: briefing?.display_category,
    oneLine: briefing?.one_line,
    jarvisTake: briefing?.jarvis_take,
    verdictLabel: consideration.verdictLabel,
    verdictTone: consideration.verdictTone,
    bestMoveTitle: consideration.bestMoveTitle,
    bestNextAction: briefing?.best_next_action,
    confidenceLabel: briefing?.confidence_label,
    effortLevel: briefing?.effort_level,
    spendingPosture: briefing?.spending_posture,
    evidenceSummary: briefing?.evidence_summary,
    cleanedTags: briefing?.cleaned_tags,
    sourceDomain: sourceDomainForItem(item),
    locationLabel:
      consideration.location?.neighborhood ??
      consideration.location?.city ??
      consideration.location?.label,
    neighborhood: item.locationName ?? undefined,
    datetime: item.startsAt ?? undefined,
    imageUrl: heroImageForItem(item) ?? undefined,
    score: briefing?.confidence ?? item.score ?? scoreIndexedItem(item).total,

    whyItFits: briefing?.why_it_matters ?? item.reasons[0] ?? "Matches your taste profile.",
    whyNow: briefing?.why_now ?? item.reasons[1] ?? "Available now.",
    actions: { save: true, pass: true, openPlan: Boolean(planSlug) },
    routeOnSave: ["radar.saved"],
    routeOnPass: ["radar.passed"],
  };
}

function compareRadarItems(a: IndexedItem, b: IndexedItem): number {
  const aTime = sortTime(a.startsAt);
  const bTime = sortTime(b.startsAt);
  if (aTime !== bTime) return aTime - bTime;
  const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function sortTime(iso?: string): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function rowToTodayCommandItem(row: SurfacedItemRow): TodayCommandItem {
  const planSlug = readPlanSlug(row.payload);
  const planId = readPlanId(row.payload);
  const briefing = readBriefingFromPayload(row.payload);
  const reason = briefing?.jarvis_take ?? row.reasons?.[0] ?? row.subtitle ?? undefined;
  return {
    id: row.id,
    title: briefing?.display_title ?? row.title ?? "Untitled",
    subtitle: briefing?.display_category ?? row.subtitle ?? undefined,
    summary: briefing?.one_line ?? row.description ?? undefined,
    source: row.source ?? undefined,
    type: row.type ?? undefined,
    category: row.category ?? undefined,
    destination: row.destination,
    status: row.status,
    startsAt: row.starts_at ?? undefined,
    locationName: row.location_name ?? undefined,
    planId,
    planSlug,
    reason,
    score: row.score ?? undefined,
  };
}

function fallbackTimelineForPlan(
  plan: PlanRow,
  keyStats: Record<string, unknown>,
  planSlug: string | undefined,
  display: { title: string; summary?: string } | null,
): TodayTimelineItem {
  const timeWindow = formatTimeWindow(
    typeof keyStats.starts_at === "string" ? keyStats.starts_at : undefined,
    typeof keyStats.ends_at === "string" ? keyStats.ends_at : undefined,
  );
  const primaryMove =
    typeof keyStats.primary_move === "string"
      ? keyStats.primary_move
      : plan.summary ?? "Open the plan and make the next clean move.";
  return {
    id: `${plan.id}-active-plan`,
    time: timeWindow ?? "Plan",
    title: display?.title ?? cleanDisplayText(plan.title) ?? "Plan",
    status: "pending",
    planId: plan.id,
    planSlug,
    expandable: true,
    details: cleanDisplayText(primaryMove) ?? "Open the plan and make the next clean move.",
    locationLine: plan.location_line ?? undefined,
    timingNote: timeWindow ?? cleanDisplayText(
      typeof keyStats.best_window === "string" ? keyStats.best_window : undefined,
    ),
    prepNote: cleanDisplayText(readFirstGrabListLabel(keyStats)),
    canPersistStatus: false,
  };
}

function buildTodayHero(
  plan: PlanRow | null,
  keyStats: Record<string, unknown>,
  display: { title: string; summary?: string } | null,
  weeklyRhythm: WeeklyRhythm,
): { greeting: string; summary: string } {
  const now = new Date();
  const rhythmState = getDayRhythmState(weeklyRhythm, now);
  const greeting = greetingForNow(now, rhythmState);
  if (!plan) {
    return {
      greeting,
      summary: noteForRhythm(rhythmState, false),
    };
  }
  const startsAt = typeof keyStats.starts_at === "string" ? keyStats.starts_at : undefined;
  const planType = typeof keyStats.plan_type === "string" ? keyStats.plan_type : plan.category;
  const timeWindow = formatTimeWindow(
    startsAt,
    typeof keyStats.ends_at === "string" ? keyStats.ends_at : undefined,
  );
  const activeToday =
    startsAt && isTodayIso(startsAt) &&
    ["dining", "event", "activity", "culture", "outdoors", "fitness"].includes(planType ?? "");
  if (activeToday) {
    return {
      greeting,
      summary: timeWindow
        ? "You’re clear until it’s time to move."
        : noteForRhythm(rhythmState, true),
    };
  }
  return {
    greeting,
    summary: noteForRhythm(rhythmState, Boolean(display?.title)),
  };
}

function greetingForNow(now: Date, rhythmState: DayRhythmState): string {
  if (rhythmState.phase === "work") return "Locked in.";
  const hour = now.getHours();
  if (hour < 12) return "Good morning, J.";
  if (hour < 17) return "Good afternoon, J.";
  return "Good evening, J.";
}

function noteForRhythm(state: DayRhythmState, hasPlan: boolean): string {
  if (!state.isWorkday) {
    return hasPlan
      ? "One thing is worth keeping in view."
      : "A steady day. Nothing urgent.";
  }
  switch (state.phase) {
    case "before_commute":
    case "morning_commute":
      return "Work first. Everything else can wait.";
    case "work":
      return "You’re in the work block. Nothing else needs your attention.";
    case "home_commute":
      return "You’re clear until you’re back home.";
    case "evening":
      return hasPlan
        ? "Your evening is lightly set."
        : "A steady day. Nothing urgent.";
    default:
      return hasPlan
        ? "One thing is worth keeping in view."
        : "A steady day. Nothing urgent.";
  }
}

function buildPlanDisplay(
  plan: PlanRow,
  keyStats: Record<string, unknown>,
  sourceRow: SurfacedItemRow | undefined,
): { title: string; summary?: string } {
  const briefing = sourceRow ? readBriefingFromPayload(sourceRow.payload) : null;
  const titleCandidates = [
    briefing?.display_title,
    typeof keyStats.display_title === "string" ? keyStats.display_title : undefined,
    plan.title,
  ];
  const title =
    titleCandidates
      .map((candidate) => cleanDisplayText(candidate))
      .find((candidate) => candidate && !looksRawSourceText(candidate)) ??
    cleanDisplayText(titleCandidates.find(Boolean)) ??
    "Active plan";
  const summary =
    cleanDisplayText(briefing?.one_line) ??
    cleanDisplayText(typeof keyStats.hero_angle === "string" ? keyStats.hero_angle : undefined) ??
    cleanDisplayText(plan.summary ?? undefined);
  return { title, summary };
}

async function listUpcomingBridgeItems(userId: string): Promise<TodayCommandItem[]> {
  try {
    const supabase = await getServerSupabase();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", userId)
      .not("status", "in", "(passed,completed,expired,archived)")
      .or(
        [
          "destination.eq.upcoming",
          `and(status.in.(saved,planned),starts_at.gte.${nowIso})`,
        ].join(","),
      )
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("score", { ascending: false, nullsFirst: false })
      .limit(3);
    if (error) {
      console.error("[surface-loader] today.upcoming", error);
      return [];
    }
    return ((data ?? []) as SurfacedItemRow[]).map(rowToTodayCommandItem);
  } catch (error) {
    console.error("[surface-loader] today.upcoming", error);
    return [];
  }
}

function readPlanGrabList(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.grab_list)) return [];
  return value.grab_list
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (isRecord(entry) && typeof entry.label === "string") return entry.label;
      return null;
    })
    .filter((entry): entry is string => Boolean(entry));
}

function readFirstGrabListLabel(value: unknown): string | undefined {
  return readPlanGrabList(value)[0];
}

function readPlanSlug(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.plan_slug === "string" ? value.plan_slug : undefined;
}

function readPlanId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.plan_id === "string" ? value.plan_id : undefined;
}

function isLinkedToPlan(
  item: { planId?: string; planSlug?: string },
  planId: string | undefined,
): boolean {
  return Boolean(planId && item.planId === planId);
}

function cleanDisplayText(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value
    .replace(/local-radar:[^\s]+/gi, "")
    .replace(/seed:[^\s]+/gi, "")
    .replace(/\s*-\s*Instagram\b/gi, "")
    .replace(/View all \d+ comments.*$/gi, "")
    .replace(/#[\w-]+/g, "")
    .replace(/\b[A-Za-z0-9._%+-]+\'s profile\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > 160 ? `${cleaned.slice(0, 157).trim()}...` : cleaned;
}

function looksRawSourceText(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("instagram") ||
    lower.includes("view all") ||
    lower.includes("comments") ||
    lower.includes("local-radar") ||
    lower.includes("seed:") ||
    lower.includes("query:")
  );
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

function readSlugFromKeyStats(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.slug === "string" ? value.slug : undefined;
}

function formatTimeWindow(
  startsAt: string | undefined,
  endsAt: string | undefined,
): string | undefined {
  const start = startsAt ? formatShortTime(startsAt) : undefined;
  const end = endsAt ? formatShortTime(endsAt) : undefined;
  if (start && end) return `${start}–${end}`;
  return start ?? end;
}

function formatShortTime(iso: string): string | undefined {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function isTodayIso(iso: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function logQueryError(scope: string, error: unknown) {
  if (!error) return;
  console.error("[surface-loader]", scope, error);
}

async function countUpcoming(userId: string): Promise<number> {
  try {
    const supabase = await getServerSupabase();
    const nowIso = new Date().toISOString();
    const { count, error } = await supabase
      .from("surfaced_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .or(
        [
          "destination.eq.upcoming",
          `and(status.in.(saved,planned),starts_at.gte.${nowIso})`,
        ].join(","),
      );
    if (error) {
      console.error("[surface-loader] countUpcoming", error);
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}

function logSurfaceError(scope: string, error: unknown) {
  console.error("[surface-loader]", scope, error);
}
