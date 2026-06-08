import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwner } from "@/lib/auth";
import {
  DEFAULT_OPERATING_PREFERENCES,
  normalizeOperatingPreferences,
} from "@/lib/operating/operatingPreferences";
import { normalizeWeeklyRhythm } from "@/lib/schedule/weeklyRhythm";
import { getCurrentWeather } from "@/lib/sources/openMeteo";
import { geocode, hasMapbox } from "@/lib/sources/mapbox";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { hasEmbeddings } from "@/lib/ai/embeddings";
import { semanticMemorySearch } from "@/lib/memory/memoryStore";
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
  FounderKnownPlace,
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
const BOLINGBROOK_DEFAULT_LOCATION = {
  city: "Bolingbrook",
  state: "IL",
  lat: 41.6986,
  lng: -88.0684,
} as const;

// Narrow projection of places_library used for chat context (see knownPlaces query).
type KnownPlaceRow = {
  name: string;
  slug: string;
  place_type: string | null;
  neighborhood: string | null;
  cuisine_or_focus: string | null;
  price_level: string | null;
  vibe_keywords: string[] | null;
  verdict: string | null;
  verdict_strength: number | string | null;
  best_for: string[] | null;
};

export async function buildFounderContextPacket(options: {
  userId?: string;
  includeWeather?: boolean;
  now?: Date;
  supabase?: SupabaseClient;
  /**
   * When set (and an embedding provider is configured), `stablePreferences`
   * are retrieved by semantic similarity to this query instead of by recency.
   * Omit for cron/ambient/general packets — behavior is then unchanged.
   */
  contextQuery?: string;
} = {}): Promise<FounderContextPacket> {
  const owner = options.userId ? null : await requireOwner();
  const userId = options.userId ?? owner?.id;
  if (!userId) throw new Error("Missing user id");

  const now = options.now ?? new Date();
  const supabase = options.supabase ?? await getServerSupabase();

  const [
    profileRes,
    liveLocationRes,
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
    knownPlacesRes,
    operatingRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,home_city,timezone,home_latitude,home_longitude")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("live_location")
      .select("latitude,longitude,accuracy_m,captured_at")
      .eq("user_id", userId)
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
    supabase
      .from("places_library")
      .select(
        "name,slug,place_type,neighborhood,cuisine_or_focus,price_level,vibe_keywords,verdict,verdict_strength,best_for",
      )
      .eq("user_id", userId)
      .order("verdict_strength", { ascending: false, nullsFirst: false })
      .limit(40),
    supabase
      .from("user_operating_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  logQueryError("context.profile", profileRes.error);
  logQueryError("context.live_location", liveLocationRes.error);
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
  logQueryError("context.places.library", knownPlacesRes.error);
  logQueryError("context.operating", operatingRes.error);

  const profile = (profileRes.data ?? null) as {
    display_name?: string | null;
    home_city?: string | null;
    timezone?: string | null;
    home_latitude?: number | string | null;
    home_longitude?: number | string | null;
  } | null;
  const founder = (founderRes.data ?? null) as FounderProfileRow | null;
  const weeklyRhythm = readWeeklyRhythm(founder?.weekly_rhythm);
  const operating = operatingRes.data
    ? normalizeOperatingPreferences(operatingRes.data)
    : { ...DEFAULT_OPERATING_PREFERENCES };
  const timezone = profile?.timezone ?? weeklyRhythm?.timezone ?? "UTC";
  const liveLocation = (liveLocationRes.data ?? null) as {
    latitude: number;
    longitude: number;
    accuracy_m: number;
    captured_at: string;
  } | null;
  const location = await readLocation(profile, liveLocation);
  const weather = await readWeather(location, Boolean(options.includeWeather));

  // Stable preferences: semantic when a contextQuery is supplied and an
  // embedding provider is configured, otherwise the recency query above.
  // Semantic search self-falls-back to recency if no embedded rows exist.
  let memories = ((memoryRes.data ?? []) as MemoryItemRow[]).map(mapMemory);
  if (options.contextQuery && hasEmbeddings()) {
    try {
      const semantic = await semanticMemorySearch(options.contextQuery, userId, MEMORY_LIMIT);
      if (semantic.length > 0) {
        memories = semantic.slice(0, MEMORY_LIMIT).map((m) => ({
          id: m.id,
          content: m.content,
          kind: m.type,
          confidence: m.confidence,
          source: m.source,
          tags: m.tags,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        }));
      }
    } catch (err) {
      logQueryError("context.memory.semantic", err);
    }
  }
  // Recent context stays recency-ordered — recency is correct there.
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
  const knownPlaces: FounderKnownPlace[] = ((knownPlacesRes.data ?? []) as KnownPlaceRow[]).map((row) => ({
    name: row.name,
    slug: row.slug,
    placeType: row.place_type ?? null,
    neighborhood: row.neighborhood ?? null,
    cuisineOrFocus: row.cuisine_or_focus ?? null,
    priceLevel: row.price_level ?? null,
    vibeKeywords: row.vibe_keywords ?? [],
    verdict: row.verdict ?? null,
    verdictStrength: row.verdict_strength != null ? Number(row.verdict_strength) : null,
    bestFor: row.best_for ?? [],
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
    operating,
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
    knownPlaces,
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

async function readLocation(
  profile: {
    home_city?: string | null;
    home_latitude?: number | string | null;
    home_longitude?: number | string | null;
  } | null,
  liveLocation: { latitude: number; longitude: number } | null,
): Promise<FounderLocationContext> {
  const homeCity = profile?.home_city ?? process.env.DEFAULT_CITY ?? null;

  // Priority 1: live GPS fix from the browser (written by useLiveLocation).
  if (liveLocation?.latitude != null && liveLocation?.longitude != null) {
    return {
      homeCity,
      homeState: process.env.DEFAULT_STATE ?? null,
      homeLat: liveLocation.latitude,
      homeLng: liveLocation.longitude,
    };
  }

  // Priority 2: home coordinates saved in the user's profile.
  const dbLat = readNumber(profile?.home_latitude);
  const dbLng = readNumber(profile?.home_longitude);
  if (dbLat != null && dbLng != null) {
    return {
      homeCity,
      homeState: process.env.DEFAULT_STATE ?? null,
      homeLat: dbLat,
      homeLng: dbLng,
    };
  }

  // Priority 3: geocode home_city string; Priority 4: DEFAULT_HOME_* env vars; Priority 5: Bolingbrook hardcode.
  const geocoded = await geocodeHomeCity(homeCity);
  const lat = geocoded?.lat ?? readNumberEnv("DEFAULT_HOME_LAT") ?? BOLINGBROOK_DEFAULT_LOCATION.lat;
  const lng = geocoded?.lng ?? readNumberEnv("DEFAULT_HOME_LNG") ?? BOLINGBROOK_DEFAULT_LOCATION.lng;
  return {
    homeCity: geocoded?.city ?? homeCity ?? BOLINGBROOK_DEFAULT_LOCATION.city,
    homeState: geocoded?.state ?? process.env.DEFAULT_STATE ?? BOLINGBROOK_DEFAULT_LOCATION.state,
    homeLat: lat,
    homeLng: lng,
  };
}

async function geocodeHomeCity(homeCity: string | null): Promise<{ city: string; state: string | null; lat: number; lng: number } | null> {
  const query = homeCity?.trim();
  if (!query) return null;
  const local = geocodeKnownHomeCity(query);
  if (local) return local;
  if (!hasMapbox()) return null;
  try {
    const result = (await geocode(query))[0];
    if (!result) return null;
    return {
      city: result.placeName,
      state: result.context?.find((part) => /^[A-Z]{2}$/.test(part)) ?? null,
      lat: result.lat,
      lng: result.lng,
    };
  } catch (error) {
    console.warn("[context.packet] home_city geocode failed; using configured/default home coordinates", error);
    return null;
  }
}

function geocodeKnownHomeCity(value: string): { city: string; state: string | null; lat: number; lng: number } | null {
  const normalized = value.toLowerCase();
  if (normalized.includes("bolingbrook")) {
    return {
      city: "Bolingbrook",
      state: "IL",
      lat: BOLINGBROOK_DEFAULT_LOCATION.lat,
      lng: BOLINGBROOK_DEFAULT_LOCATION.lng,
    };
  }
  if (normalized.includes("chicago")) {
    return {
      city: "Chicago",
      state: "IL",
      lat: 41.8781,
      lng: -87.6298,
    };
  }
  return null;
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
  return readNumber(raw);
}

function readNumber(raw: unknown): number | null {
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
