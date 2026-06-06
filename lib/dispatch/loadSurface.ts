import "server-only";

import { getViewableProfileId } from "@/lib/auth";
import { buildBrainContext } from "@/lib/brain/context";
import {
  buildIntelligenceReason,
  reasonForCircleMoment,
  type IntelligenceReason,
} from "@/lib/brain/intelligenceReason";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { listIndexItems } from "@/lib/index/repo";
import { readBriefingFromPayload } from "@/lib/brain/briefingTypes";
import { actionTitleForItem } from "@/lib/brain/actionTitles";
import { buildNorthLifeCadence } from "@/lib/brain/lifeCadence";
import { evaluateActiveRadarItem } from "@/lib/intelligence/radarFrontRoom";
import { purposeLabelForItem } from "@/lib/brain/purposeLabels";
import { RADAR_ACTIVE_ITEM_LIMIT } from "@/lib/brain/constants";
import {
  buildConsiderationBrief,
  heroImageForItem,
  sourceDomainForItem,
} from "@/lib/items/considerationBrief";
import { isUsableVenueImageUrl } from "@/lib/items/venueImage";
import { scoreIndexedItem } from "@/lib/scoring/scoreIndexedItem";
import { findDayOfItems, MAX_DAY_OF_ON_TODAY } from "@/lib/scheduling/promoteItems";
import {
  DEFAULT_WEEKLY_RHYTHM,
  getDayRhythmState,
  normalizeWeeklyRhythm,
  planWeeklyRhythmTodayRows,
  type DayRhythmState,
  type WeeklyRhythm,
} from "@/lib/schedule/weeklyRhythm";
import type {
  CirclePersonRow,
  CircleUpdateRow,
  CurrentEventRow,
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
    const { id, viewer } = await getViewableProfileId();
    if (!id) return emptyTodayPayload();

    const supabase = await getServerSupabase();
    const [
      timelineRes,
      primaryPlanRes,
      todayItemsRes,
      upcomingItemsRes,
      upcomingCountRes,
      dayOf,
      rhythmRes,
      tonightEventsRes,
      circleUpdatesRes,
    ] =
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
          // Today reflects only what the owner has COMMITTED to (saved or planned
          // from Radar, or added via Calendar). Auto-surfaced discovered/shown/
          // opened items are discovery, not commitments — they live on Radar, not
          // Today. Without this gate Today fills with suggestions the owner never
          // chose.
          .in("status", ["saved", "planned"])
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
        // Tonight's events: starts_at today or within next 24h, status verified or surfaced
        supabase
          .from("current_events")
          .select("*")
          .eq("user_id", id)
          .in("status", ["verified", "surfaced"])
          .gte("starts_at", new Date().toISOString())
          .lte("starts_at", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
          .order("starts_at", { ascending: true })
          .limit(5),
        supabase
          .from("circle_updates")
          .select("*")
          .eq("user_id", id)
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

    logQueryError("today.timeline", timelineRes.error);
    logQueryError("today.plan", primaryPlanRes.error);
    logQueryError("today.items", todayItemsRes.error);
    logQueryError("today.rhythm", rhythmRes.error);
    logQueryError("today.tonightEvents", tonightEventsRes.error);
    logQueryError("today.circleUpdates", circleUpdatesRes.error);

    // Fetch source_ids of current_events rows the user has committed to.
    // A surfaced_item with source_id = current_events.id and status saved/planned
    // means the user explicitly acted on that event.
    const tonightEventIds = tonightEventsRes.data?.map((ev) => ev.id) ?? [];
    let committedEventIds = new Set<string>();
    if (tonightEventIds.length > 0) {
      const { data: committedRows } = await supabase
        .from("surfaced_items")
        .select("source_id")
        .eq("user_id", id)
        .in("status", ["saved", "planned"])
        .in("source_id", tonightEventIds);
      committedEventIds = new Set(
        (committedRows ?? [])
          .map((row) => row.source_id)
          .filter((sourceId): sourceId is string => typeof sourceId === "string"),
      );
    }

    const tonightEventRows = (tonightEventsRes.data ?? []) as CurrentEventRow[];
    const tonightEvents: TodayCommandItem[] = tonightEventRows
      .filter((ev) => committedEventIds.has(ev.id))
      .map((ev) => ({
        id: ev.id,
        title: ev.title,
        subtitle: ev.venue_name,
        summary: ev.verdict ?? ev.description ?? undefined,
        source: "event_pulse",
        type: "event",
        category: "events",
        destination: "radar",
        status: ev.status,
        startsAt: ev.starts_at,
        locationName: ev.venue_name,
        reason: ev.verdict ?? undefined,
      }));
    const circleTodayItems = ((circleUpdatesRes.data ?? []) as CircleUpdateRow[])
      .filter(shouldSurfaceCircleMoment)
      .slice(0, 3)
      .map(rowToCircleTodayItem);

    const timelineRows = (timelineRes.data ?? []) as TodayTimelineItemRow[];
    const planRow = (primaryPlanRes.data?.[0] ?? null) as PlanRow | null;
    const planKeyStats = isRecord(planRow?.key_stats) ? planRow.key_stats : {};
    const weeklyRhythm = rhythmRes.data?.weekly_rhythm
      ? normalizeWeeklyRhythm(rhythmRes.data.weekly_rhythm)
      : { ...DEFAULT_WEEKLY_RHYTHM, enabled: false };
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
    const planTimeline = planRow && timeline.length === 0
      ? [fallbackTimelineForPlan(planRow, planKeyStats, planSlug, activePlanDisplay)]
      : timeline;
    const { rows: rhythmRowPlans, hiddenReasons: rhythmHiddenReasons, state: rhythmState } =
      planWeeklyRhythmTodayRows(weeklyRhythm);
    const rhythmTimeline = buildRhythmTimelineRows(weeklyRhythm);
    console.info("[today.weekly_rhythm.load]", {
      userId: id,
      viewerEmail: viewer.email,
      found: Boolean(rhythmRes.data?.weekly_rhythm),
      enabled: weeklyRhythm.enabled,
      workdays: weeklyRhythm.workdays,
      todayWeekday: rhythmState.weekday,
      phase: rhythmState.phase,
      minuteOfDay: rhythmState.minuteOfDay,
      rowsAdded: rhythmRowPlans.map((row) => row.key),
      hiddenReasons: rhythmHiddenReasons,
    });
    const activeTimeline = [...rhythmTimeline, ...planTimeline];

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
    const todayStack = [
      ...circleTodayItems,
      ...todayItems.filter((item) => item.id !== nextMove?.id),
    ].slice(0, 6);
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
      tonightEvents: tonightEvents.length > 0 ? tonightEvents : undefined,
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
      status: ["shown", "opened"],
      limit: RADAR_ACTIVE_ITEM_LIMIT * 2,
    });
    const visibleItems = items
      // Finds are products, not outings — they bypass the outing-readiness gate.
      .filter((item) => item.category === "finds" || evaluateActiveRadarItem(item).allowed)
      .sort(compareRadarItems)
      .slice(0, RADAR_ACTIVE_ITEM_LIMIT);
    const [withPlanRefs, libraryImages] = await Promise.all([
      withRadarPlanRefs(visibleItems),
      resolveLibraryImages(visibleItems),
    ]);
    // Only surface a card once its plan is fully built and viewable — tapping a
    // Radar card should land on a complete plan page, never a stub. Finds are
    // exempt: they have no plan and open their own Finds detail page.
    return withPlanRefs
      .filter(({ item, planRef }) => item.category === "finds" || planRef.isReady)
      .map(({ item, planRef }) =>
        toRadarCard(item, planRef, libraryImages.get(item.id)),
      );
  } catch (error) {
    logSurfaceError("radar", error);
    return [];
  }
};

/**
 * Batch-resolve curated library photos for items that have no image of their
 * own yet. One `in (...)` query keeps the Radar feed cheap while making photos
 * resilient to materialization timing (an item surfaced before its library row
 * gained an image still gets the photo here).
 */
async function resolveLibraryImages(
  items: IndexedItem[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const byPlaceId = new Map<string, string[]>();
  for (const item of items) {
    if (item.imageUrl) continue;
    const payload = isRecord(item.rawPayload) ? item.rawPayload : {};
    const placeId =
      typeof payload.library_place_id === "string" ? payload.library_place_id : null;
    if (!placeId) continue;
    const list = byPlaceId.get(placeId) ?? [];
    list.push(item.id);
    byPlaceId.set(placeId, list);
  }
  if (byPlaceId.size === 0) return result;

  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase
      .from("places_library")
      .select("id, image_url")
      .in("id", [...byPlaceId.keys()]);
    if (error) {
      logQueryError("radar.libraryImages", error);
      return result;
    }
    for (const row of (data ?? []) as Array<{ id: string; image_url: string | null }>) {
      const url = row.image_url;
      if (!isUsableVenueImageUrl(url)) continue;
      for (const itemId of byPlaceId.get(row.id) ?? []) {
        result.set(itemId, url);
      }
    }
  } catch (error) {
    logQueryError("radar.libraryImages", error);
  }
  return result;
}

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
    const brainContext = await buildBrainContext({
      userId: id,
      includeWeather: false,
    });

    return {
      northStar: {
        title: pillars[0]?.title ?? "North",
        subtitle: pillars[0]?.description ?? "Long-term direction.",
      },
      pillars,
      signals,
      lifeCadence: buildNorthLifeCadence(brainContext),
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

type RadarPlanRef = {
  slug?: string;
  hasStoredRef: boolean;
  /** True only when the plan is fully built (build_status='ready' + has sections). */
  isReady: boolean;
  /** When this should happen — a committed start, else the brain's suggested time. */
  whenIso?: string;
  /** True when the time is committed (event/scheduled) vs merely suggested. */
  whenConfirmed?: boolean;
};

type PlanRefRow = { id: string; key_stats: unknown; build_status: string | null };

async function withRadarPlanRefs(
  items: IndexedItem[],
): Promise<Array<{ item: IndexedItem; planRef: RadarPlanRef }>> {
  const refs = items.map((item) => ({
    item,
    planId: readPlanId(item.rawPayload),
    planSlug: readPlanSlug(item.rawPayload),
  }));
  const hasAnyRef = refs.some((ref) => ref.planId || ref.planSlug);
  if (!hasAnyRef) {
    return refs.map(({ item }) => ({
      item,
      planRef: { hasStoredRef: false, isReady: false },
    }));
  }

  const { id } = await getViewableProfileId();
  if (!id) {
    return refs.map(({ item }) => ({
      item,
      planRef: { hasStoredRef: false, isReady: false },
    }));
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("plans")
    .select("id,key_stats,build_status")
    .eq("user_id", id)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) {
    logQueryError("radar.planRefs", error);
    // Fail open: trust the stored ref so a transient error doesn't blank Radar.
    return refs.map(({ item, planId, planSlug }) => ({
      item,
      planRef: {
        hasStoredRef: Boolean(planId || planSlug),
        isReady: Boolean(planId || planSlug),
      },
    }));
  }

  const plans = (data ?? []) as PlanRefRow[];
  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  const bySlug = new Map(
    plans
      .map((plan) => [readSlugFromKeyStats(plan.key_stats), plan] as const)
      .filter((entry): entry is readonly [string, PlanRefRow] =>
        typeof entry[0] === "string",
      ),
  );

  const resolved = refs.map(({ item, planId, planSlug }) => {
    const plan =
      (planId ? byId.get(planId) : undefined) ??
      (planSlug ? bySlug.get(planSlug) : undefined);
    return { item, planId, planSlug, plan };
  });

  // A plan is only "ready to view" when it has finished building AND has
  // sections — that's the gate for surfacing a Radar card.
  const readyIds = [
    ...new Set(
      resolved
        .map((r) => r.plan)
        .filter((p): p is PlanRefRow => Boolean(p) && p!.build_status === "ready")
        .map((p) => p.id),
    ),
  ];
  const withSections = await plansWithSections(supabase, readyIds);

  return resolved.map(({ item, planId, planSlug, plan }) => {
    const actualSlug = plan ? readSlugFromKeyStats(plan.key_stats) ?? plan.id : undefined;
    const isReady = Boolean(
      plan && plan.build_status === "ready" && withSections.has(plan.id),
    );
    const when = plan ? readPlanWhen(plan.key_stats) : undefined;
    return {
      item,
      planRef: {
        slug: actualSlug,
        hasStoredRef: Boolean(planId || planSlug),
        isReady,
        whenIso: when?.iso,
        whenConfirmed: when?.confirmed,
      },
    };
  });
}

/** When the plan happens: a committed start_at (confirmed) or suggested_start. */
function readPlanWhen(
  keyStats: unknown,
): { iso?: string; confirmed: boolean } | undefined {
  if (!isRecord(keyStats)) return undefined;
  const startsAt = typeof keyStats.starts_at === "string" ? keyStats.starts_at : undefined;
  if (startsAt) return { iso: startsAt, confirmed: true };
  const suggested =
    typeof keyStats.suggested_start === "string" ? keyStats.suggested_start : undefined;
  if (suggested) return { iso: suggested, confirmed: false };
  return undefined;
}

/** Returns the subset of plan ids that have at least one persisted section. */
async function plansWithSections(
  supabase: Awaited<ReturnType<typeof getServerSupabase>>,
  planIds: string[],
): Promise<Set<string>> {
  if (planIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("plan_sections")
    .select("plan_id")
    .in("plan_id", planIds);
  if (error) {
    logQueryError("radar.planSections", error);
    // Fail open for these (they're already build_status='ready').
    return new Set(planIds);
  }
  return new Set(
    ((data ?? []) as Array<{ plan_id: string }>).map((row) => row.plan_id),
  );
}

function toRadarCard(
  item: IndexedItem,
  planRef: RadarPlanRef,
  libraryImage?: string,
): RadarCard {
  const category = mapCategory(item.type, item.category);
  const planSlug = planRef.slug;
  const briefing = item.briefing;
  const consideration = buildConsiderationBrief(item);
  const payload = isRecord(item.rawPayload) ? item.rawPayload : {};
  const brief = readCardBrief(payload);
  const intelligence = isRecord(payload.intelligence) ? payload.intelligence : {};
  const move = isRecord(payload.radar_move) ? payload.radar_move : {};
  const actionTitle =
    stringValue(move.move_title) ??
    stringValue(payload.move_title) ??
    stringValue(intelligence.move_title) ??
    actionTitleForItem(item).title;
  const purposeLabel =
    stringValue(payload.purpose_label) ??
    stringValue(intelligence.purpose_label) ??
    purposeLabelForItem(item);
  const reasonSurfaced =
    stringValue(move.move_summary) ??
    stringValue(move.why_this) ??
    stringValue(payload.reason_surfaced) ??
    stringValue(intelligence.reason_surfaced);
  const strongestAngle =
    stringValue(move.why_now) ??
    stringValue(payload.strongest_angle) ??
    stringValue(intelligence.strongest_angle);
  const planReadiness = readPlanReadiness(payload.plan_readiness ?? intelligence.plan_readiness);
  const scoreBreakdown = readNumberRecord(payload.score_breakdown ?? intelligence.score_breakdown);
  // The editorial line. Prefer the generated brief's jarvis_line (the
  // "Longman & Eagle's grown-up Hyde Park spot…" voice), then the council's
  // rich one-line (mirrored onto item.description), and only fall back to the
  // terse radar_move summary ("refined dinner") as a last resort.
  const editorialLine =
    brief?.jarvisLine ??
    cleanDisplayText(item.description) ??
    stringValue(briefing?.one_line) ??
    cleanDisplayText(item.subtitle) ??
    reasonSurfaced;
  return {
    id: item.id,
    source: item.source,
    type: item.type,
    status: item.status,
    destination: item.destination,
    planSlug,
    category,
    title: actionTitle || briefing?.display_title || item.title,
    summary: editorialLine ?? "",
    displayCategory: briefing?.display_category,
    purposeLabel,
    vibe: stringValue(payload.vibe) ?? stringValue(intelligence.vibe),
    diversityGroup: stringValue(payload.diversity_group) ?? stringValue(intelligence.diversity_group),
    reasonSurfaced,
    strongestAngle,
    missingInfo: readStringArray(payload.missing_info ?? intelligence.missing_info),
    planReadiness,
    scoreBreakdown,
    oneLine: editorialLine,
    whoItsFor: brief?.whoItsFor,
    priceEstimate: brief?.priceEstimate,
    jarvisTake: brief?.jarvisLine ?? strongestAngle ?? briefing?.jarvis_take,
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
      stringValue(move.location_label) ??
      consideration.location?.neighborhood ??
      consideration.location?.city ??
      consideration.location?.label,
    neighborhood: item.locationName ?? undefined,
    // Show WHEN: the event's own time, else the plan's committed/suggested time.
    datetime: item.startsAt ?? planRef.whenIso ?? undefined,
    whenConfirmed: Boolean(item.startsAt) || Boolean(planRef.whenConfirmed),
    imageUrl: heroImageForItem(item) ?? brief?.heroImageUrl ?? libraryImage ?? undefined,
    placeholderKind: consideration.media.placeholderKind,
    score: planReadiness?.confidence ?? briefing?.confidence ?? item.score ?? scoreIndexedItem(item).total,

    whyItFits: stringValue(move.why_this) ?? reasonSurfaced ?? briefing?.why_it_matters ?? item.reasons[0] ?? "Matches your taste profile.",
    whyNow: stringValue(move.why_now) ?? briefing?.why_now ?? strongestAngle ?? item.reasons[1] ?? "Available now.",
    actions: {
      save: true,
      pass: true,
      openPlan: Boolean(planSlug || planRef.hasStoredRef || planReadiness?.shouldPreparePlan),
    },
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
  const intelligenceReason =
    readIntelligenceReason(readPayloadValue(row.payload, "intelligence_reason")) ??
    buildIntelligenceReason({
      summary: reason ?? briefing?.one_line ?? "Matched current Today context.",
      contextFactors: [
        briefing?.why_it_matters,
        briefing?.why_now,
        row.starts_at ? `Timing: ${row.starts_at}` : null,
      ],
      timingReason: briefing?.why_now,
      confidence: typeof row.score === "number" ? Math.max(0, Math.min(1, row.score)) : undefined,
    });
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
    intelligenceReason,
    score: row.score ?? undefined,
  };
}

function shouldSurfaceCircleMoment(row: CircleUpdateRow): boolean {
  const urgency = row.urgency?.toLowerCase() ?? "";
  return Boolean(
    row.suggested_action ||
      urgency === "high" ||
      urgency === "urgent" ||
      urgency === "medium",
  );
}

function rowToCircleTodayItem(row: CircleUpdateRow): TodayCommandItem {
  // Day Orchestrator writes seam-awareness rows with source='day_orchestrator';
  // these render as inline-expandable day alerts rather than relationship moments.
  const signalType: TodayCommandItem["signalType"] =
    (row.source as string) === "day_orchestrator" ? "day_alert" : "life";

  return {
    id: row.id,
    title: row.title,
    subtitle: signalType === "day_alert" ? "Today" : "Circle",
    summary: row.suggested_action ?? row.summary,
    source: "circle",
    type: "relationship_update",
    category: "circle",
    destination: "circle",
    status: "shown",
    reason: row.suggested_action ?? row.summary,
    intelligenceReason: reasonForCircleMoment({
      title: row.title,
      suggestedAction: row.suggested_action,
      urgency: row.urgency,
    }),
    signalType,
    occasionContext:
      signalType === "life"
        ? {
            occasionType: detectCircleOccasionType(row.title),
            clusterNote: row.summary,
          }
        : undefined,
    score: scoreCircleUrgency(row.urgency),
  };
}

function detectCircleOccasionType(title: string): string {
  const normalized = title.toLowerCase();
  if (normalized.includes("birthday")) return "birthday";
  if (normalized.includes("party")) return "party";
  if (normalized.includes("anniversary")) return "milestone";
  return "checkin";
}

function scoreCircleUrgency(urgency: string | null): number {
  switch ((urgency ?? "").toLowerCase()) {
    case "urgent":
    case "high":
      return 0.82;
    case "medium":
      return 0.68;
    default:
      return 0.55;
  }
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

function buildRhythmTimelineRows(rhythm: WeeklyRhythm): TodayTimelineItem[] {
  const { rows } = planWeeklyRhythmTodayRows(rhythm);
  return rows.map((row) => ({
    id: `weekly-rhythm-${row.key}`,
    time: row.time,
    title: row.title,
    status: "pending",
    expandable: true,
    details: row.details,
    locationLine: row.locationLine,
    timingNote: row.timingNote,
    canPersistStatus: false,
  }));
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
  const normalized = category?.toLowerCase();
  if (normalized === "move" || normalized === "health") return "move";
  if (normalized === "dining") return "dining";
  if (normalized === "event" || normalized === "events") return "events";
  if (normalized === "culture") return "culture";
  if (normalized === "music") return "music";
  if (normalized === "place" || normalized === "places") return "place";
  if (normalized === "sports") return "sports";
  if (normalized === "travel") return "travel";
  if (normalized === "style" || normalized === "shopping") return "style";
  if (normalized === "finds") return "finds";
  if (normalized === "product") return "product";
  if (normalized === "idea") return "idea";
  if (normalized === "creative") return "creative";
  if (normalized === "activity") return "activity";
  if (normalized === "outdoors" || normalized === "land") return "outdoors";
  if (normalized === "skill") return "skill";
  if (normalized === "health") return "health";
  if (normalized === "ownership") return "ownership";
  switch (type) {
    case "restaurant":
      return "dining";
    case "event":
      return "events";
    case "culture":
      return "culture";
    case "place":
      return "place";
    case "product":
      return "product";
    case "travel":
      return "travel";
    case "style":
      return "style";
    case "creative":
      return "creative";
    case "health":
      return "health";
    case "recommendation":
      return "move";
    case "real_estate":
      return "idea";
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
    lifeCadence: [],
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

function readPayloadValue(payload: unknown, key: string): unknown {
  return isRecord(payload) ? payload[key] : undefined;
}

function readIntelligenceReason(value: unknown): IntelligenceReason | undefined {
  if (!isRecord(value) || typeof value.summary !== "string") return undefined;
  return {
    summary: value.summary,
    contextFactors: readStringArray(value.contextFactors) ?? [],
    northAlignment: isRecord(value.northAlignment)
      ? {
          score: typeof value.northAlignment.score === "number" ? value.northAlignment.score : 0,
          matchedPillars: readStringArray(value.northAlignment.matchedPillars) ?? [],
          reason: stringValue(value.northAlignment.reason) ?? "",
        }
      : undefined,
    behaviorInfluence: readStringArray(value.behaviorInfluence),
    circleInfluence: readStringArray(value.circleInfluence),
    memoryInfluence: readStringArray(value.memoryInfluence),
    timingReason: stringValue(value.timingReason),
    sourceStrength: readSourceStrength(value.sourceStrength),
    confidence: typeof value.confidence === "number" ? value.confidence : undefined,
  };
}

function readSourceStrength(value: unknown): IntelligenceReason["sourceStrength"] | undefined {
  return value === "weak" || value === "medium" || value === "strong" ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return values.length > 0 ? values : undefined;
}

function readNumberRecord(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function readPlanReadiness(value: unknown): RadarCard["planReadiness"] | undefined {
  if (!isRecord(value)) return undefined;
  const confidence = typeof value.confidence === "number" ? value.confidence : undefined;
  if (confidence == null) return undefined;
  return {
    shouldPreparePlan: value.shouldPreparePlan === true,
    confidence,
    knownDetails: readStringArray(value.knownDetails) ?? [],
    missingDetails: readStringArray(value.missingDetails) ?? [],
    planSeed: value.planSeed,
  };
}

function readSlugFromKeyStats(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.slug === "string" ? value.slug : undefined;
}

/**
 * Read the generated Consideration Brief blob (surfaced_items.payload.brief)
 * for the Radar card. This is the same rich brief the /item page renders —
 * jarvis_line, who_its_for, price_estimate, hero_image_url — so cards read as
 * editorial signal, not terse internal labels.
 */
function readCardBrief(payload: Record<string, unknown>): {
  jarvisLine?: string;
  whoItsFor?: string;
  priceEstimate?: string;
  heroImageUrl?: string;
} | null {
  const raw = payload.brief;
  if (!isRecord(raw)) return null;
  return {
    jarvisLine: cleanDisplayText(stringValue(raw.jarvis_line)),
    whoItsFor: cleanDisplayText(stringValue(raw.who_its_for)),
    priceEstimate: stringValue(raw.price_estimate),
    heroImageUrl: stringValue(raw.hero_image_url),
  };
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
