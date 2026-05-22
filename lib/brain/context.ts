import "server-only";

import { requireOwner } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { getDefaultLocation } from "@/lib/env";
import { hasGooglePlaces } from "@/lib/sources/googlePlaces";
import { getCurrentWeather } from "@/lib/sources/openMeteo";
import { normalizeWeeklyRhythm } from "@/lib/schedule/weeklyRhythm";
import type { BrainContextPacket } from "@/lib/brain/types";
import type {
  FounderProfileRow,
  MemoryItemRow,
  NorthPillarRow,
  PlanRow,
  SurfacedItemRow,
} from "@/lib/types/database";

const RECENT_ACTION_LIMIT = 20;
const RECENT_SIGNAL_LIMIT = 25;

export async function buildBrainContext(
  options: { includeWeather?: boolean } = {},
): Promise<BrainContextPacket> {
  const owner = await requireOwner();
  const supabase = await getServerSupabase();
  const home = safeHome();

  const [founderRes, memoryRes, signalsRes, actionsRes, pillarsRes, planRes] =
    await Promise.all([
      supabase
        .from("founder_profile")
        .select("*")
        .eq("user_id", owner.id)
        .maybeSingle(),
      supabase
        .from("memory_items")
        .select("content,kind,confidence")
        .eq("user_id", owner.id)
        .eq("status", "active")
        .order("is_pinned", { ascending: false })
        .order("confidence", { ascending: false })
        .limit(20),
      supabase
        .from("behavior_signals")
        .select("signal_type,subject_id,created_at")
        .eq("user_id", owner.id)
        .order("created_at", { ascending: false })
        .limit(RECENT_SIGNAL_LIMIT),
      supabase
        .from("surfaced_items")
        .select("title,status,category")
        .eq("user_id", owner.id)
        .in("status", ["saved", "passed", "planned", "completed"])
        .order("updated_at", { ascending: false })
        .limit(RECENT_ACTION_LIMIT),
      supabase
        .from("north_pillars")
        .select("title,active_signals")
        .eq("user_id", owner.id),
      supabase
        .from("plans")
        .select("id,title,summary,live_enabled,updated_at")
        .eq("user_id", owner.id)
        .order("live_enabled", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1),
    ]);

  const founder = (founderRes.data ?? null) as FounderProfileRow | null;
  const weeklyRhythm = normalizeWeeklyRhythm(founder?.weekly_rhythm);
  const memory = (memoryRes.data ?? []) as Pick<
    MemoryItemRow,
    "content" | "kind" | "confidence"
  >[];
  const signals = (signalsRes.data ?? []) as {
    signal_type: string;
    subject_id: string | null;
    created_at: string;
  }[];
  const actions = (actionsRes.data ?? []) as Pick<
    SurfacedItemRow,
    "title" | "status" | "category"
  >[];
  const pillars = (pillarsRes.data ?? []) as Pick<
    NorthPillarRow,
    "title" | "active_signals"
  >[];
  const plan = (planRes.data?.[0] ?? null) as PlanRow | null;

  let weather: BrainContextPacket["weather"] = null;
  if (options.includeWeather !== false && (hasGooglePlaces() || true)) {
    try {
      const w = await getCurrentWeather({ lat: home.lat, lng: home.lng });
      weather = {
        temperatureF: w.temperatureF,
        windMph: w.windMph,
        weatherCode: w.weatherCode,
      };
    } catch {
      weather = null;
    }
  }

  const northTags = unique(
    pillars.flatMap((p) => [
      ...(p.active_signals ?? []),
      slug(p.title ?? ""),
    ]),
  );

  return {
    now: new Date().toISOString(),
    homeCity: home.city,
    homeState: home.state,
    homeLat: home.lat,
    homeLng: home.lng,
    founder: {
      displayName: null,
      homeCity: home.city ?? null,
      timezone: null,
      lifeDirection: founder?.life_direction ?? null,
      currentFocus: founder?.current_focus ?? null,
      vibeKeywords: founder?.vibe_keywords ?? [],
      avoidKeywords: founder?.avoid_keywords ?? [],
      dealbreakers: founder?.dealbreakers ?? [],
      pinnedPrinciples: founder?.pinned_principles ?? [],
    },
    memory: memory.map((m) => ({
      content: m.content,
      kind: m.kind,
      confidence: Number(m.confidence ?? 0),
    })),
    recentSignals: signals,
    recentActions: actions.map((a) => ({
      title: a.title ?? "(untitled)",
      status: a.status,
      category: a.category,
    })),
    northTags,
    weather,
    activePlan: plan
      ? {
          id: plan.id,
          title: plan.title,
          summary: plan.summary,
          liveEnabled: plan.live_enabled,
        }
      : null,
    weeklyRhythm: {
      enabled: weeklyRhythm.enabled,
      workdays: weeklyRhythm.workdays,
      leaveHome: weeklyRhythm.leave_home,
      workStart: weeklyRhythm.work_start,
      leaveWork: weeklyRhythm.leave_work,
      arriveHome: weeklyRhythm.arrive_home,
      workLocation: weeklyRhythm.work_location,
      timezone: weeklyRhythm.timezone,
    },
  };
}

function safeHome() {
  try {
    return getDefaultLocation();
  } catch {
    return { lat: 41.85, lng: -87.65, city: "Chicago", state: "IL" };
  }
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
