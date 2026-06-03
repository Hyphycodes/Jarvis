import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwner } from "@/lib/auth";
import { normalizeWeeklyRhythm } from "@/lib/schedule/weeklyRhythm";
import { getCurrentWeather } from "@/lib/sources/openMeteo";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type {
  BehaviorSignalRow,
  CirclePersonRow,
  CircleUpdateRow,
  FounderProfileRow,
  Json,
  MemoryItemRow,
  NorthPillarRow,
  NorthSignalRow,
  PlanRow,
  SurfacedItemRow,
  TodayTimelineItemRow,
} from "@/lib/types/database";
import type {
  FounderBehaviorSignal,
  FounderContextPacket,
  FounderLocationContext,
  FounderRadarItem,
  FounderTodayItem,
  FounderWeeklyRhythm,
} from "@/lib/context/types";
import {
  deriveDayContext,
  summarizeBehaviorPatterns,
} from "@/lib/context/types";

const MEMORY_LIMIT = 24;
const RECENT_SIGNAL_LIMIT = 40;
const RECENT_ACTION_LIMIT = 40;

export async function buildFounderContextPacket(options: {
  userId?: string;
  includeWeather?: boolean;
  now?: Date;
  supabase?: SupabaseClient;
} = {}): Promise<FounderContextPacket> {
  const owner = options.userId ? null : await requireOwner();
  const userId = options.userId ?? owner?.id;
  if (!userId) throw new Error("Missing user id");

  const now = options.now ?? new Date();
  const supabase = options.supabase ?? await getServerSupabase();

  const [
    profileRes,
    founderRes,
    memoryRes,
    recentMemoryRes,
    behaviorRes,
    actionsRes,
    currentRadarRes,
    northPillarsRes,
    northSignalsRes,
    plansRes,
    timelineRes,
    todayItemsRes,
    circlePeopleRes,
    circleUpdatesRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,home_city,timezone")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("founder_profile")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("memory_items")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("is_pinned", { ascending: false })
      .order("confidence", { ascending: false })
      .limit(MEMORY_LIMIT),
    supabase
      .from("memory_items")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("behavior_signals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(RECENT_SIGNAL_LIMIT),
    supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["saved", "passed", "planned", "completed", "archived"])
      .order("updated_at", { ascending: false })
      .limit(RECENT_ACTION_LIMIT),
    supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", userId)
      .eq("destination", "radar")
      .in("status", ["discovered", "shown", "opened", "saved"])
      .order("updated_at", { ascending: false })
      .limit(16),
    supabase
      .from("north_pillars")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("north_signals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(16),
    supabase
      .from("plans")
      .select("*")
      .eq("user_id", userId)
      .not("status", "in", "(completed,cancelled)")
      .order("live_enabled", { ascending: false })
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("today_timeline_items")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .limit(16),
    supabase
      .from("surfaced_items")
      .select("*")
      .eq("user_id", userId)
      .eq("destination", "today")
      .not("status", "in", "(passed,completed,expired,archived)")
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(16),
    supabase
      .from("circle_people")
      .select("*")
      .eq("user_id", userId)
      .order("closeness_score", { ascending: false })
      .limit(24),
    supabase
      .from("circle_updates")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(24),
  ]);

  logQueryError("context.profile", profileRes.error);
  logQueryError("context.founder", founderRes.error);
  logQueryError("context.memory", memoryRes.error);
  logQueryError("context.memory.recent", recentMemoryRes.error);
  logQueryError("context.behavior", behaviorRes.error);
  logQueryError("context.actions", actionsRes.error);
  logQueryError("context.radar", currentRadarRes.error);
  logQueryError("context.north.pillars", northPillarsRes.error);
  logQueryError("context.north.signals", northSignalsRes.error);
  logQueryError("context.plans", plansRes.error);
  logQueryError("context.timeline", timelineRes.error);
  logQueryError("context.today.items", todayItemsRes.error);
  logQueryError("context.circle.people", circlePeopleRes.error);
  logQueryError("context.circle.updates", circleUpdatesRes.error);

  const profile = (profileRes.data ?? null) as {
    display_name?: string | null;
    home_city?: string | null;
    timezone?: string | null;
  } | null;
  const founder = (founderRes.data ?? null) as FounderProfileRow | null;
  const weeklyRhythm = readWeeklyRhythm(founder?.weekly_rhythm);
  const timezone = profile?.timezone ?? weeklyRhythm?.timezone ?? "UTC";
  const location = readLocation(profile);
  const weather = await readWeather(location, Boolean(options.includeWeather));

  const memories = ((memoryRes.data ?? []) as MemoryItemRow[]).map(mapMemory);
  const recentMemories = ((recentMemoryRes.data ?? []) as MemoryItemRow[]).map(mapMemory);
  const behaviorSignals = ((behaviorRes.data ?? []) as BehaviorSignalRow[]).map(mapBehavior);
  const actionRows = (actionsRes.data ?? []) as SurfacedItemRow[];
  const recentActions = actionRows.map(mapRadarItem);
  const currentRadar = ((currentRadarRes.data ?? []) as SurfacedItemRow[]).map(mapRadarItem);
  const recentlySaved = recentActions.filter((item) => item.status === "saved");
  const recentlyPassed = recentActions.filter((item) => item.status === "passed");
  const recentlyPlanned = recentActions.filter((item) => item.status === "planned");
  const northPillars = ((northPillarsRes.data ?? []) as NorthPillarRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    progress: row.progress,
    activeSignals: row.active_signals ?? [],
    updatedAt: row.updated_at,
  }));
  const northPriorities = ((northSignalsRes.data ?? []) as NorthSignalRow[]).map((row) => ({
    id: row.id,
    pillarId: row.pillar_id,
    title: row.title,
    summary: row.summary,
    action: row.action,
    source: row.source,
    createdAt: row.created_at,
  }));
  const northTags = unique(
    northPillars.flatMap((pillar) => [
      pillar.title,
      ...pillar.activeSignals,
      slug(pillar.title),
      ...pillar.activeSignals.map(slug),
    ]),
  );
  const activePlans = ((plansRes.data ?? []) as PlanRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    buildStatus: row.build_status,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    summary: row.summary,
    liveEnabled: row.live_enabled,
    updatedAt: row.updated_at,
  }));
  const todayTimeline = ((timelineRes.data ?? []) as TodayTimelineItemRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    time: row.time,
    planId: row.plan_id,
    details: row.details,
    source: "timeline" as const,
  }));
  const todayItems = ((todayItemsRes.data ?? []) as SurfacedItemRow[]).map(mapTodayItem);
  const circlePeople = ((circlePeopleRes.data ?? []) as CirclePersonRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    role: row.role,
    closenessScore: Number(row.closeness_score ?? 0),
    lastInteraction: row.last_interaction,
    nextAction: row.next_action,
    currentThread: row.current_thread,
    neighborhood: row.neighborhood,
    notes: row.notes ?? [],
  }));
  const circleMoments = ((circleUpdatesRes.data ?? []) as CircleUpdateRow[]).map((row) => ({
    id: row.id,
    personId: row.person_id,
    title: row.title,
    summary: row.summary,
    suggestedAction: row.suggested_action,
    urgency: row.urgency,
    source: row.source,
    createdAt: row.created_at,
  }));

  return {
    userId,
    now: now.toISOString(),
    timezone,
    dayContext: deriveDayContext({
      now,
      timezone,
      weeklyRhythmEnabled: weeklyRhythm?.enabled,
      workdays: weeklyRhythm?.workdays,
    }),
    location,
    weather,
    founder: {
      displayName: profile?.display_name ?? null,
      lifeDirection: founder?.life_direction ?? null,
      currentFocus: founder?.current_focus ?? null,
      vibeKeywords: founder?.vibe_keywords ?? [],
      avoidKeywords: founder?.avoid_keywords ?? [],
      dealbreakers: founder?.dealbreakers ?? [],
      pinnedPrinciples: founder?.pinned_principles ?? [],
      weeklyRhythm,
    },
    north: {
      pillars: northPillars,
      activePriorities: northPriorities,
      tags: northTags,
    },
    radar: {
      current: currentRadar,
      recentlySaved,
      recentlyPassed,
      patterns: summarizeBehaviorPatterns(recentActions),
    },
    today: {
      upcomingItems: [...todayTimeline, ...todayItems],
      activePlan: activePlans.find((plan) => plan.liveEnabled || plan.status === "active") ?? activePlans[0] ?? null,
      activePlans,
    },
    circle: {
      upcomingMoments: circleMoments,
      relevantPeople: circlePeople,
    },
    memory: {
      stablePreferences: memories,
      recentSignals: recentMemories,
    },
    behavior: {
      recentSignals: behaviorSignals,
      recentItemActions: recentActions,
      savePatterns: summarizeBehaviorPatterns(recentlySaved),
      passPatterns: summarizeBehaviorPatterns(recentlyPassed),
      planPatterns: summarizeBehaviorPatterns(recentlyPlanned),
    },
  };
}

function mapRadarItem(row: SurfacedItemRow): FounderRadarItem {
  return {
    id: row.id,
    title: row.title ?? "Untitled",
    category: row.category,
    type: row.type,
    status: row.status,
    destination: row.destination,
    planningState: row.planning_state,
    tasteFitSummary: row.taste_fit_summary,
    reasons: row.reasons ?? [],
    tags: row.tags ?? [],
    score: row.score,
    startsAt: row.starts_at,
    updatedAt: row.updated_at,
  };
}

function mapTodayItem(row: SurfacedItemRow): FounderTodayItem {
  return {
    id: row.id,
    title: row.title ?? "Untitled",
    status: row.status,
    planId: readPlanId(row.payload),
    startsAt: row.starts_at,
    source: "surfaced_item",
  };
}

function mapMemory(row: MemoryItemRow) {
  return {
    id: row.id,
    content: row.content,
    kind: row.kind,
    confidence: Number(row.confidence ?? 0),
    source: row.source,
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBehavior(row: BehaviorSignalRow): FounderBehaviorSignal {
  return {
    signalType: row.signal_type,
    subjectId: row.subject_id,
    objectType: row.object_type,
    objectId: row.object_id,
    metadata: row.metadata,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

function readWeeklyRhythm(value: Json | null | undefined): FounderWeeklyRhythm | null {
  if (!isRecord(value)) return null;
  const rhythm = normalizeWeeklyRhythm(value);
  return {
    enabled: rhythm.enabled,
    workdays: rhythm.workdays,
    leaveHome: rhythm.leave_home,
    workStart: rhythm.work_start,
    leaveWork: rhythm.leave_work,
    arriveHome: rhythm.arrive_home,
    workLocation: rhythm.work_location,
    timezone: rhythm.timezone,
  };
}

function readLocation(profile: { home_city?: string | null } | null): FounderLocationContext {
  const lat = readNumberEnv("DEFAULT_HOME_LAT");
  const lng = readNumberEnv("DEFAULT_HOME_LNG");
  return {
    homeCity: profile?.home_city ?? process.env.DEFAULT_CITY ?? null,
    homeState: process.env.DEFAULT_STATE ?? null,
    homeLat: lat,
    homeLng: lng,
  };
}

async function readWeather(
  location: FounderLocationContext,
  includeWeather: boolean,
): Promise<FounderContextPacket["weather"]> {
  if (!includeWeather || location.homeLat == null || location.homeLng == null) return null;
  try {
    const weather = await getCurrentWeather({
      lat: location.homeLat,
      lng: location.homeLng,
    });
    return {
      temperatureF: weather.temperatureF,
      windMph: weather.windMph,
      weatherCode: weather.weatherCode,
    };
  } catch {
    return null;
  }
}

function readPlanId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const planId = value.plan_id;
  return typeof planId === "string" && planId.trim() ? planId.trim() : null;
}

function readNumberEnv(key: string): number | null {
  const raw = process.env[key];
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function logQueryError(scope: string, error: unknown) {
  if (error) console.error("[context.packet]", scope, error);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
