import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describeSourceHealth } from "@/lib/sources/gather";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  isPausedForMode,
  isScheduledMode,
  normalizeAutopilotMode,
  type RadarAutopilotRunMode,
} from "@/lib/radar/autopilotControlPolicy";
import { FOUNDATION_SPRINT_TARGETS } from "@/lib/radar/foundationSprint";
import type {
  Database,
  Json,
  RadarAutopilotActivityRow,
  RadarAutopilotRunRow,
  RadarAutopilotSettingsRow,
} from "@/lib/types/database";

type AutopilotSettingsInsert =
  Database["public"]["Tables"]["radar_autopilot_settings"]["Insert"];

export type RadarAutopilotRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial_success"
  | "failed"
  | "paused"
  | "cancelled"
  | "blocked";

export type RadarAutopilotActivityLevel = "info" | "success" | "warning" | "error";

export type LibraryControlRoomStatus = {
  settings: {
    enabled: boolean;
    pausedAt: string | null;
    pausedReason: string | null;
    stopRequestedAt: string | null;
    stopRequestedRunId: string | null;
    foundationSprintEnabled: boolean;
    foundationSprintStartedAt: string | null;
    foundationSprintCompletedAt: string | null;
    foundationSprintTargets: Json;
    foundationSprintReason: string | null;
    foundationSprintMissionCursor: number;
  };
  state: "running" | "paused" | "blocked" | "failed" | "partial_success" | "healthy" | "foundation_sprint" | "bootstrap_needed" | "idle";
  activeRun: RadarAutopilotRunRow | null;
  lastRun: RadarAutopilotRunRow | null;
  lastBootstrapRun: RadarAutopilotRunRow | null;
  activity: RadarAutopilotActivityRow[];
  providerStatus: Array<{ key: string; name: string; configured: boolean; purpose: string }>;
  missingProviders: string[];
};

export { isPausedForMode, isScheduledMode, normalizeAutopilotMode };

export async function ensureAutopilotSettings(input: {
  userId: string;
  supabase?: SupabaseClient;
}): Promise<RadarAutopilotSettingsRow> {
  const supabase = input.supabase ?? await getServerSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("radar_autopilot_settings")
    .upsert({
      user_id: input.userId,
      updated_at: now,
    }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as RadarAutopilotSettingsRow;
}

export async function setAutopilotEnabled(input: {
  userId: string;
  enabled: boolean;
  reason?: string | null;
  supabase?: SupabaseClient;
}): Promise<RadarAutopilotSettingsRow> {
  const supabase = input.supabase ?? await getServerSupabase();
  const now = new Date().toISOString();
  const payload: AutopilotSettingsInsert = input.enabled
    ? {
        user_id: input.userId,
        enabled: true,
        paused_at: null,
        paused_reason: null,
        stop_requested_at: null,
        stop_requested_run_id: null,
        updated_at: now,
      }
    : {
        user_id: input.userId,
        enabled: false,
        paused_at: now,
        paused_reason: input.reason ?? "owner_requested",
        updated_at: now,
      };
  const { data, error } = await supabase
    .from("radar_autopilot_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logAutopilotActivity({
    userId: input.userId,
    level: input.enabled ? "success" : "warning",
    message: input.enabled ? "Autopilot resumed." : "Autopilot paused.",
    metadata: { reason: input.reason ?? null },
    supabase,
  });
  return data as RadarAutopilotSettingsRow;
}

export async function setFoundationSprintEnabled(input: {
  userId: string;
  enabled: boolean;
  reason?: string | null;
  resetCursor?: boolean;
  completed?: boolean;
  supabase?: SupabaseClient;
}): Promise<RadarAutopilotSettingsRow> {
  const supabase = input.supabase ?? await getServerSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("radar_autopilot_settings")
    .upsert({
      user_id: input.userId,
      foundation_sprint_enabled: input.enabled,
      foundation_sprint_started_at: input.enabled ? now : undefined,
      foundation_sprint_completed_at: input.completed ? now : null,
      foundation_sprint_targets: FOUNDATION_SPRINT_TARGETS as unknown as Json,
      foundation_sprint_reason: input.reason ?? (input.enabled ? "owner_requested" : "paused"),
      foundation_sprint_mission_cursor: input.resetCursor ? 0 : undefined,
      updated_at: now,
    }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logAutopilotActivity({
    userId: input.userId,
    level: input.enabled ? "success" : input.completed ? "success" : "warning",
    message: input.enabled
      ? "Foundation Sprint started."
      : input.completed
        ? "Foundation Sprint completed."
        : "Foundation Sprint paused.",
    metadata: { reason: input.reason ?? null },
    supabase,
  });
  return data as RadarAutopilotSettingsRow;
}

export async function advanceFoundationMissionCursor(input: {
  userId: string;
  cursor: number;
  completed?: boolean;
  supabase: SupabaseClient;
}): Promise<void> {
  await input.supabase
    .from("radar_autopilot_settings")
    .update({
      foundation_sprint_mission_cursor: input.cursor,
      foundation_sprint_enabled: input.completed ? false : undefined,
      foundation_sprint_completed_at: input.completed ? new Date().toISOString() : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId);
}

export async function requestAutopilotStop(input: {
  userId: string;
  runId?: string | null;
  supabase?: SupabaseClient;
}): Promise<RadarAutopilotSettingsRow> {
  const supabase = input.supabase ?? await getServerSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("radar_autopilot_settings")
    .upsert({
      user_id: input.userId,
      stop_requested_at: now,
      stop_requested_run_id: input.runId ?? null,
      updated_at: now,
    }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logAutopilotActivity({
    userId: input.userId,
    runId: input.runId,
    level: "warning",
    message: "Stop requested. Autopilot will stop after the current step.",
    supabase,
  });
  return data as RadarAutopilotSettingsRow;
}

export async function clearAutopilotStop(input: {
  userId: string;
  supabase: SupabaseClient;
}): Promise<void> {
  await input.supabase
    .from("radar_autopilot_settings")
    .update({
      stop_requested_at: null,
      stop_requested_run_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId);
}

export async function shouldStopAutopilot(input: {
  userId: string;
  runId?: string | null;
  supabase: SupabaseClient;
}): Promise<boolean> {
  const { data } = await input.supabase
    .from("radar_autopilot_settings")
    .select("stop_requested_at,stop_requested_run_id")
    .eq("user_id", input.userId)
    .maybeSingle();
  const settings = data as Pick<RadarAutopilotSettingsRow, "stop_requested_at" | "stop_requested_run_id"> | null;
  if (!settings?.stop_requested_at) return false;
  return !settings.stop_requested_run_id || settings.stop_requested_run_id === input.runId;
}

export async function createAutopilotRun(input: {
  userId: string;
  mode: RadarAutopilotRunMode;
  operation?: string | null;
  providerStatus?: Json;
  missingProviders?: Json;
  countsBefore?: Json;
  supabase: SupabaseClient;
}): Promise<string | null> {
  const now = new Date().toISOString();
  const { data, error } = await input.supabase
    .from("radar_autopilot_runs")
    .insert({
      user_id: input.userId,
      mode: input.mode,
      status: "running",
      operation: input.operation ?? null,
      provider_status: input.providerStatus ?? {},
      missing_providers: input.missingProviders ?? [],
      counts_before: input.countsBefore ?? {},
      started_at: now,
      last_heartbeat_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) {
    console.warn("[radar.autopilot.run] create failed", error.message);
    return null;
  }
  const runId = (data as { id: string }).id;
  await logAutopilotActivity({
    userId: input.userId,
    runId,
    level: "info",
    message: `${input.mode} autopilot started.`,
    metadata: { operation: input.operation ?? null },
    supabase: input.supabase,
  });
  return runId;
}

export async function heartbeatAutopilotRun(input: {
  userId: string;
  runId?: string | null;
  operation?: string | null;
  supabase: SupabaseClient;
}): Promise<void> {
  if (!input.runId) return;
  await input.supabase
    .from("radar_autopilot_runs")
    .update({
      operation: input.operation ?? undefined,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.runId)
    .eq("user_id", input.userId);
}

export async function finishAutopilotRun(input: {
  userId: string;
  runId?: string | null;
  status: RadarAutopilotRunStatus;
  summary?: string | null;
  operation?: string | null;
  operationsRun?: Json;
  providerStatus?: Json;
  missingProviders?: Json;
  countsAfter?: Json;
  candidatesCreated?: number;
  libraryItemsCreated?: number;
  sourcesCreated?: number;
  candidatesHeld?: number;
  candidatesPromoted?: number;
  errorMessage?: string | null;
  supabase: SupabaseClient;
}): Promise<void> {
  if (!input.runId) return;
  const now = new Date().toISOString();
  await input.supabase
    .from("radar_autopilot_runs")
    .update({
      status: input.status,
      operation: input.operation ?? null,
      operations_run: input.operationsRun ?? [],
      finished_at: now,
      last_heartbeat_at: now,
      summary: input.summary ?? null,
      provider_status: input.providerStatus ?? {},
      missing_providers: input.missingProviders ?? [],
      counts_after: input.countsAfter ?? {},
      candidates_created: input.candidatesCreated ?? 0,
      library_items_created: input.libraryItemsCreated ?? 0,
      sources_created: input.sourcesCreated ?? 0,
      candidates_held: input.candidatesHeld ?? 0,
      candidates_promoted: input.candidatesPromoted ?? 0,
      error_message: input.errorMessage ?? null,
      updated_at: now,
    })
    .eq("id", input.runId)
    .eq("user_id", input.userId);
  await logAutopilotActivity({
    userId: input.userId,
    runId: input.runId,
    level: input.status === "succeeded"
      ? "success"
      : input.status === "failed"
        ? "error"
        : "warning",
    message: input.summary ?? `Autopilot ${input.status}.`,
    supabase: input.supabase,
  });
}

export async function logAutopilotActivity(input: {
  userId: string;
  runId?: string | null;
  level?: RadarAutopilotActivityLevel;
  message: string;
  metadata?: Json;
  supabase?: SupabaseClient;
}): Promise<void> {
  const supabase = input.supabase ?? await getServerSupabase();
  const { error } = await supabase.from("radar_autopilot_activity").insert({
    user_id: input.userId,
    run_id: input.runId ?? null,
    level: input.level ?? "info",
    message: input.message,
    metadata: input.metadata ?? {},
  });
  if (error) console.warn("[radar.autopilot.activity] write failed", error.message);
}

export async function readLibraryControlRoomStatus(input: {
  userId: string;
  bootstrapNeeded: boolean;
  supabase?: SupabaseClient;
}): Promise<LibraryControlRoomStatus> {
  const supabase = input.supabase ?? await getServerSupabase();
  const [settings, activeRunRes, lastRunRes, lastBootstrapRes, activityRes] = await Promise.all([
    ensureAutopilotSettings({ userId: input.userId, supabase }),
    supabase
      .from("radar_autopilot_runs")
      .select("*")
      .eq("user_id", input.userId)
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("radar_autopilot_runs")
      .select("*")
      .eq("user_id", input.userId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("radar_autopilot_runs")
      .select("*")
      .eq("user_id", input.userId)
      .eq("mode", "bootstrap")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("radar_autopilot_activity")
      .select("*")
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  const rawActiveRun = (activeRunRes.data as RadarAutopilotRunRow | null) ?? null;
  const activeRun = isStaleRunningRun(rawActiveRun) ? null : rawActiveRun;
  const lastRun = (lastRunRes.data as RadarAutopilotRunRow | null) ?? null;
  const lastBootstrapRun = (lastBootstrapRes.data as RadarAutopilotRunRow | null) ?? null;
  const providerStatus = providerStatusRows();
  const missingProviders = providerStatus.filter((provider) => !provider.configured).map((provider) => provider.key);
  return {
    settings: {
      enabled: settings.enabled,
      pausedAt: settings.paused_at,
      pausedReason: settings.paused_reason,
      stopRequestedAt: settings.stop_requested_at,
      stopRequestedRunId: settings.stop_requested_run_id,
      foundationSprintEnabled: Boolean(settings.foundation_sprint_enabled),
      foundationSprintStartedAt: settings.foundation_sprint_started_at,
      foundationSprintCompletedAt: settings.foundation_sprint_completed_at,
      foundationSprintTargets: settings.foundation_sprint_targets,
      foundationSprintReason: settings.foundation_sprint_reason,
      foundationSprintMissionCursor: Number(settings.foundation_sprint_mission_cursor ?? 0),
    },
    state: deriveControlState({
      enabled: settings.enabled,
      foundationSprintEnabled: Boolean(settings.foundation_sprint_enabled),
      activeRun,
      lastRun,
      bootstrapNeeded: input.bootstrapNeeded,
      missingProviders,
    }),
    activeRun,
    lastRun,
    lastBootstrapRun,
    activity: (activityRes.data ?? []) as RadarAutopilotActivityRow[],
    providerStatus,
    missingProviders,
  };
}

function providerStatusRows(): LibraryControlRoomStatus["providerStatus"] {
  const status = describeSourceHealth();
  return [
    { key: "google-places", name: "Google Places", configured: status["google-places"] === "available", purpose: "places" },
    { key: "ticketmaster", name: "Ticketmaster", configured: status.ticketmaster === "available", purpose: "events" },
    { key: "tavily", name: "Tavily", configured: status.tavily === "available", purpose: "web/source discovery" },
    { key: "brave", name: "Brave", configured: status.brave === "available", purpose: "fallback search" },
    { key: "serpapi", name: "SerpAPI", configured: status.serpapi === "available", purpose: "fallback search" },
  ];
}

function deriveControlState(input: {
  enabled: boolean;
  foundationSprintEnabled: boolean;
  activeRun: RadarAutopilotRunRow | null;
  lastRun: RadarAutopilotRunRow | null;
  bootstrapNeeded: boolean;
  missingProviders: string[];
}): LibraryControlRoomStatus["state"] {
  if (!input.enabled) return "paused";
  if (input.activeRun) return "running";
  if (input.foundationSprintEnabled) return "foundation_sprint";
  if (input.lastRun?.status === "partial_success") return "partial_success";
  if (input.lastRun?.status === "failed") return "failed";
  if (input.bootstrapNeeded && input.missingProviders.length >= 5) return "blocked";
  if (input.bootstrapNeeded) return "bootstrap_needed";
  if (input.lastRun?.status === "succeeded") return "healthy";
  return "idle";
}

function isStaleRunningRun(run: RadarAutopilotRunRow | null): boolean {
  if (!run) return false;
  const heartbeat = run.last_heartbeat_at ?? run.started_at;
  const time = new Date(heartbeat).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time > 10 * 60 * 1000;
}
