import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFounderContextPacket } from "@/lib/context/founderContextPacket";
import {
  buildContextTraceSummary,
  safeWriteIntelligenceTrace,
  writeIntelligenceTraceWithClient,
} from "@/lib/brain/intelligenceTrace";
import { buildIntelligenceReason } from "@/lib/brain/intelligenceReason";
import { runScout } from "@/lib/brain/scout";
import { runEventScout } from "@/lib/brain/eventScout";
import { processCandidates } from "@/lib/intelligence/libraryWorker";
import { processEventCandidates } from "@/lib/intelligence/eventWorker";
import { processRefresh } from "@/lib/brain/refresher";
import { runAmbientIntelligence } from "@/lib/intelligence/ambientRuns";
import { buildJarvisContext } from "@/lib/intelligence/context";
import { enrichRadarItem } from "@/lib/intelligence/core";
import { isPromotableWhenUnderfilled } from "@/lib/intelligence/radarCurator";
import { rowToIndexedItem } from "@/lib/index/repo";
import { readLibraryHealth, type LibraryHealth } from "@/lib/library";
import {
  selectSourcesDueForCheck,
  scoreSourceQuality,
  upsertSourceFromCandidate,
} from "@/lib/library/sourceGraph";
import { planRadarCampaigns, type RadarCampaign } from "@/lib/radar/campaigns";
import {
  assessBootstrapNeed,
  bootstrapProviderSummary,
  BOOTSTRAP_RUN_BUDGET,
  BOOTSTRAP_TARGETS,
  foundationOperationStack,
  type BootstrapAssessment,
} from "@/lib/radar/bootstrapPolicy";
import {
  chooseRadarAutopilotOperation,
  type RadarAutopilotHealth,
  type RadarAutopilotMode,
  type RadarAutopilotOperation,
} from "@/lib/radar/autopilotPolicy";
import {
  syncCandidateInboxFromExistingPipelines,
  upsertCandidateInboxFromIndexedCandidate,
} from "@/lib/radar/candidateInbox";
import {
  clearAutopilotStop,
  advanceFoundationMissionCursor,
  createAutopilotRun,
  ensureAutopilotSettings,
  finishAutopilotRun,
  heartbeatAutopilotRun,
  isPausedForMode,
  logAutopilotActivity,
  normalizeAutopilotMode,
  shouldStopAutopilot,
} from "@/lib/radar/autopilotRuns";
import { convertCandidateInboxToLibrary } from "@/lib/radar/candidateConversion";
import {
  assessFoundationSprint,
  FOUNDATION_BATCH_BUDGET,
  foundationWorkDone,
  nextMissionCursor,
  selectFoundationMissions,
} from "@/lib/radar/foundationSprint";
import { describeSourceHealth, gatherRadarCandidates } from "@/lib/sources/gather";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  RADAR_ACTIVE_ITEM_LIMIT,
  RADAR_MIN_ACTIVE_ITEM_TARGET,
} from "@/lib/brain/constants";
import type { FounderContextPacket } from "@/lib/context/types";
import type { Json, SurfacedItemRow } from "@/lib/types/database";
import type { SourceHealth } from "@/lib/sources/types";

export type RadarAutopilotResult = {
  operation: RadarAutopilotOperation;
  activeCount: number;
  holdingCount: number;
  candidateInboxCount?: number;
  libraryCounts?: {
    places?: number;
    events?: number;
    sources?: number;
    organizations?: number;
    people?: number;
    recurringSignals?: number;
  };
  sourcesChecked: number;
  candidatesDiscovered: number;
  candidatesRejected: number;
  candidatesHeld: number;
  candidatesPromoted: number;
  libraryItemsCreated: number;
  libraryItemsRefreshed: number;
  sourcesCreated: number;
  sourcesUpgraded: number;
  sourcesCooledDown: number;
  summary: string;
  campaign?: RadarCampaign;
  skipped?: boolean;
  mode?: RadarAutopilotMode;
  bootstrapNeeded?: boolean;
  bootstrap?: BootstrapAssessment;
  operationsRun?: RadarAutopilotOperation[];
  providerStatus?: SourceHealth;
  missingProviders?: string[];
  libraryBefore?: RadarAutopilotResult["libraryCounts"];
  libraryAfter?: RadarAutopilotResult["libraryCounts"];
  candidateInboxAfter?: number;
  activeAfter?: number;
  holdingAfter?: number;
  errors?: string[];
  runId?: string | null;
  runStatus?: string;
  currentMission?: string | null;
  nextMission?: string | null;
  eventsCreated?: number;
};

export async function runRadarAutopilot(input: {
  userId: string;
  mode?: RadarAutopilotMode;
  force?: boolean;
  supabase?: SupabaseClient;
}): Promise<RadarAutopilotResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const mode = normalizeAutopilotMode(input.mode);
  const settings = await ensureAutopilotSettings({
    userId: input.userId,
    supabase,
  });
  const context = await buildFounderContextPacket({
    userId: input.userId,
    includeWeather: false,
    supabase,
  });
  const health = await readAutopilotHealth({
    userId: input.userId,
    context,
    supabase,
  });
  const campaigns = planRadarCampaigns({
    context,
    health: {
      activeCount: health.activeCount,
      holdingCount: health.holdingCount,
      candidateInboxCount: health.candidateInboxCount,
      sourceCount: health.sourceCount,
      eventFreshnessDays: health.eventFreshnessDays,
      library: health.library,
    },
  });
  const operation = chooseRadarAutopilotOperation({
    health,
    campaigns,
    mode,
  });
  const bootstrap = assessBootstrapNeed(health);
  const foundation = assessFoundationSprint(health);
  const providerStatus = describeSourceHealth();
  const missing = missingProviders(providerStatus);
  if (mode === "foundation_sprint" && !settings.foundation_sprint_enabled && !input.force) {
    return {
      ...baseResult("no_op", health, campaigns[0]),
      mode,
      bootstrapNeeded: bootstrap.needed,
      bootstrap,
      providerStatus,
      missingProviders: missing,
      skipped: true,
      runStatus: "paused",
      summary: "Foundation Sprint is off. Cron no-op.",
    };
  }
  if (mode === "foundation_sprint" && foundation.completed) {
    await advanceFoundationMissionCursor({
      userId: input.userId,
      cursor: Number(settings.foundation_sprint_mission_cursor ?? 0),
      completed: true,
      supabase,
    });
    return {
      ...baseResult("no_op", health, campaigns[0]),
      mode,
      bootstrapNeeded: false,
      bootstrap,
      providerStatus,
      missingProviders: missing,
      skipped: true,
      runStatus: "succeeded",
      summary: "Foundation Sprint targets are healthy. Returning to normal maintenance.",
    };
  }
  if (isPausedForMode({ mode, enabled: settings.enabled, force: input.force })) {
    const paused = baseResult("no_op", health, campaigns[0]);
    paused.mode = mode;
    paused.bootstrapNeeded = bootstrap.needed;
    paused.bootstrap = bootstrap;
    paused.providerStatus = providerStatus;
    paused.missingProviders = missing;
    paused.skipped = true;
    paused.runStatus = "paused";
    paused.summary = "Scheduled Radar Autopilot is paused. Owner-requested runs can still be started manually.";
    const runId = await createAutopilotRun({
      userId: input.userId,
      mode,
      operation: "no_op",
      providerStatus: providerStatus as Json,
      missingProviders: missing as Json,
      countsBefore: countsFromHealth(health),
      supabase,
    });
    paused.runId = runId;
    await finishAutopilotRun({
      userId: input.userId,
      runId,
      status: "paused",
      summary: paused.summary,
      operation: "no_op",
      providerStatus: providerStatus as Json,
      missingProviders: missing as Json,
      countsAfter: countsFromHealth(health),
      supabase,
    });
    return paused;
  }
  await clearAutopilotStop({ userId: input.userId, supabase });
  const base = baseResult(operation, health, campaigns[0]);
  base.mode = mode;
  base.bootstrapNeeded = mode === "bootstrap" || bootstrap.needed;
  base.bootstrap = bootstrap;
  base.providerStatus = providerStatus;
  base.missingProviders = missing;
  const runId = await createAutopilotRun({
    userId: input.userId,
    mode,
    operation,
    providerStatus: providerStatus as Json,
    missingProviders: missing as Json,
    countsBefore: countsFromHealth(health),
    supabase,
  });
  const result = await executeOperation({
    userId: input.userId,
    operation,
    base,
    health,
    campaigns,
    context,
    supabase,
    force: input.force || mode === "manual_force",
    providerStatus,
    runId,
  });
  result.runId = runId;
  if (operation === "foundation_build_mode") {
    const after = await readAutopilotHealth({
      userId: input.userId,
      context,
      supabase,
    });
    result.libraryAfter = libraryCountsFromHealth(after);
    result.candidateInboxAfter = after.candidateInboxCount;
    result.activeAfter = after.activeCount;
    result.holdingAfter = after.holdingCount;
  }
  const didUsefulWork = foundationWorkDone({
    candidates: result.candidatesDiscovered,
    sources: result.sourcesCreated,
    library: result.libraryItemsCreated + result.libraryItemsRefreshed,
    events: result.eventsCreated ?? 0,
    held: result.candidatesHeld,
    promoted: result.candidatesPromoted,
    checked: result.sourcesChecked,
  });
  const runStatus = result.runStatus === "cancelled"
    ? "cancelled"
    : result.errors?.length && didUsefulWork
      ? "partial_success"
      : result.summary.includes("failed safely")
        ? "failed"
      : result.bootstrapNeeded && result.candidatesDiscovered === 0 && result.sourcesCreated === 0 && result.libraryItemsCreated === 0 && missing.length >= 5
        ? "blocked"
        : "succeeded";
  result.runStatus = runStatus;
  await finishAutopilotRun({
    userId: input.userId,
    runId,
    status: runStatus,
    summary: result.summary,
    operation,
    operationsRun: (result.operationsRun ?? [operation]) as unknown as Json,
    providerStatus: providerStatus as Json,
    missingProviders: missing as Json,
    countsAfter: {
      active: result.activeAfter ?? result.activeCount,
      holding: result.holdingAfter ?? result.holdingCount,
      candidateInbox: result.candidateInboxAfter ?? result.candidateInboxCount ?? 0,
      library: result.libraryAfter ?? result.libraryCounts ?? {},
    },
      candidatesCreated: result.candidatesDiscovered,
      libraryItemsCreated: result.libraryItemsCreated + (result.eventsCreated ?? 0),
    sourcesCreated: result.sourcesCreated,
    candidatesHeld: result.candidatesHeld,
    candidatesPromoted: result.candidatesPromoted,
    errorMessage: result.errors?.join("; ") || null,
    supabase,
  });
  await safeWriteIntelligenceTrace(
    {
      userId: input.userId,
      route: "lib/radar/autopilot.runRadarAutopilot",
      surface: mode === "scheduled" ? "cron" : "radar",
      decisionType: operation,
      contextSummary: buildContextTraceSummary(context),
      reasoning: buildIntelligenceReason({
        summary: result.summary,
        contextFactors: [
          `Active: ${health.activeCount}`,
          `Holding: ${health.holdingCount}`,
          `Candidate Inbox: ${health.candidateInboxCount}`,
          `Library depth: ${health.library.depthScore.toFixed(2)}`,
          `Sources: ${health.sourceCount}`,
          campaigns[0]?.reason,
        ],
        confidence: operation === "no_op" ? 0.6 : 0.72,
      }),
      candidatesConsidered: campaigns as unknown as Json,
      sourceQuality: {
        source_count: health.sourceCount,
        sources_due: health.sourcesDue,
        source_graph_depth: health.sourceCount,
        mode,
        operations_run: result.operationsRun ?? [operation],
        provider_status: providerStatus,
        bootstrap_needed: result.bootstrapNeeded ?? false,
        library_before: result.libraryBefore ?? libraryCountsFromHealth(health),
        library_after: result.libraryAfter ?? null,
        sources_created: result.sourcesCreated,
      },
      outcome: result.summary,
    },
    (trace) => writeIntelligenceTraceWithClient(trace, supabase),
  );
  return result;
}

async function readAutopilotHealth(input: {
  userId: string;
  context: FounderContextPacket;
  supabase: SupabaseClient;
}): Promise<RadarAutopilotHealth> {
  const now = new Date().toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    activeRes,
    holdingRes,
    inboxRes,
    sourceRes,
    eventFreshRes,
    library,
    dueSources,
  ] = await Promise.all([
    input.supabase.from("surfaced_items").select("id", { count: "exact", head: true }).eq("user_id", input.userId).eq("destination", "radar").in("status", ["shown", "opened"]),
    input.supabase.from("surfaced_items").select("id", { count: "exact", head: true }).eq("user_id", input.userId).eq("destination", "holding").in("status", ["discovered", "shown", "opened"]),
    input.supabase.from("radar_candidate_inbox").select("id", { count: "exact", head: true }).eq("user_id", input.userId).in("status", ["new", "evaluated"]),
    input.supabase.from("intelligence_sources").select("id", { count: "exact", head: true }).eq("user_id", input.userId).in("status", ["testing", "watching", "cooldown"]),
    input.supabase.from("current_events").select("discovered_at").eq("user_id", input.userId).gte("starts_at", now).order("discovered_at", { ascending: false }).limit(1).maybeSingle(),
    readLibraryHealth({ userId: input.userId, supabase: input.supabase }),
    selectSourcesDueForCheck({ userId: input.userId, supabase: input.supabase, limit: 20 }),
  ]);
  const discoveredAt = (eventFreshRes.data as { discovered_at?: string } | null)?.discovered_at;
  const eventFreshnessDays = discoveredAt
    ? Math.floor((Date.now() - new Date(discoveredAt).getTime()) / (24 * 60 * 60 * 1000))
    : null;
  return {
    activeCount: activeRes.count ?? 0,
    holdingCount: holdingRes.count ?? 0,
    candidateInboxCount: inboxRes.count ?? 0,
    sourceCount: sourceRes.count ?? 0,
    sourcesDue: dueSources.length,
    library,
    eventFreshnessDays,
    weekendReady: isWeekendWindow(new Date(input.context.now)),
    afterWorkReady: input.context.dayContext.timeOfDay === "afternoon" || input.context.dayContext.timeOfDay === "evening",
    circleReady: input.context.circle.upcomingMoments.length > 0,
    northReady: input.context.north.activePriorities.length > 0,
  };
}

async function executeOperation(input: {
  userId: string;
  operation: RadarAutopilotOperation;
  base: RadarAutopilotResult;
  health: RadarAutopilotHealth;
  campaigns: RadarCampaign[];
  context: FounderContextPacket;
  supabase: SupabaseClient;
  force?: boolean;
  providerStatus: SourceHealth;
  runId?: string | null;
}): Promise<RadarAutopilotResult> {
  const result = { ...input.base };
  try {
    switch (input.operation) {
      case "foundation_build_mode": {
        const isSprint = input.base.mode === "foundation_sprint";
        const missions = isSprint
          ? selectFoundationMissions({
              health: input.health,
              providerStatus: input.providerStatus,
              cursor: Number((await ensureAutopilotSettings({
                userId: input.userId,
                supabase: input.supabase,
              })).foundation_sprint_mission_cursor ?? 0),
              maxOperations: FOUNDATION_BATCH_BUDGET.maxOperations,
            })
          : [];
        const stack = isSprint
          ? missions.map((mission) => mission.operation)
          : foundationOperationStack({
              health: input.health,
              maxOperations: BOOTSTRAP_RUN_BUDGET.maxCampaigns,
            });
        const errors: string[] = [];
        for (const [idx, operation] of stack.entries()) {
          const mission = missions[idx];
          await heartbeatAutopilotRun({
            userId: input.userId,
            runId: input.runId,
            operation,
            supabase: input.supabase,
          });
          await logAutopilotActivity({
            userId: input.userId,
            runId: input.runId,
            level: "info",
            message: mission
              ? `Mission: ${mission.type} started. ${mission.reason}`
              : `Running ${operation}.`,
            metadata: mission ? { mission: mission.type, operation } : { operation },
            supabase: input.supabase,
          });
          const partial = await executeOperation({
            ...input,
            operation,
            base: baseResult(operation, input.health, input.campaigns[0]),
          });
          mergeResult(result, partial);
          if (partial.errors?.length) errors.push(...partial.errors);
          await logAutopilotActivity({
            userId: input.userId,
            runId: input.runId,
            level: partial.errors?.length
              ? foundationWorkDone({
                  candidates: partial.candidatesDiscovered,
                  sources: partial.sourcesCreated,
                  library: partial.libraryItemsCreated + partial.libraryItemsRefreshed,
                  events: partial.eventsCreated ?? 0,
                  held: partial.candidatesHeld,
                  promoted: partial.candidatesPromoted,
                  checked: partial.sourcesChecked,
                }) ? "warning" : "error"
              : "success",
            message: `${mission ? `Mission ${mission.type}` : operation}: ${partial.summary}`,
            metadata: {
              candidates: partial.candidatesDiscovered,
              sources: partial.sourcesCreated,
              library: partial.libraryItemsCreated,
              events: partial.eventsCreated ?? 0,
              errors: partial.errors ?? [],
            },
            supabase: input.supabase,
          });
          if (await shouldStopAutopilot({
            userId: input.userId,
            runId: input.runId,
            supabase: input.supabase,
          })) {
            result.runStatus = "cancelled";
            result.summary = `Foundation build stopped after ${operation}.`;
            await logAutopilotActivity({
              userId: input.userId,
              runId: input.runId,
              level: "warning",
              message: result.summary,
              supabase: input.supabase,
            });
            break;
          }
        }
        result.operationsRun = stack;
        result.errors = errors;
        result.skipped = stack.length === 0;
        result.currentMission = missions[0]?.type ?? null;
        result.nextMission = missions[1]?.type ?? null;
        if (isSprint) {
          const currentSettings = await ensureAutopilotSettings({
            userId: input.userId,
            supabase: input.supabase,
          });
          const nextCursor = nextMissionCursor(
            Number(currentSettings.foundation_sprint_mission_cursor ?? 0),
            missions.length,
          );
          await advanceFoundationMissionCursor({
            userId: input.userId,
            cursor: nextCursor,
            supabase: input.supabase,
          });
        }
        result.summary = foundationSummary({
          stack,
          result,
          missingProviders: input.base.missingProviders ?? missingProviders(input.providerStatus),
          sprint: isSprint,
          missions: missions.map((mission) => mission.type),
        });
        break;
      }
      case "front_room_refill": {
        const promoted = await promoteHoldingWithService({
          userId: input.userId,
          supabase: input.supabase,
          slots: Math.max(0, RADAR_MIN_ACTIVE_ITEM_TARGET - input.base.activeCount),
        });
        result.candidatesPromoted += promoted.promoted;
        result.candidatesHeld += promoted.reviewed - promoted.promoted;
        if (promoted.promoted === 0) {
          const ambient = await runAmbientIntelligence({
            runType: "radar_discovery",
            force: input.force,
            ownerUserId: input.userId,
          }).catch((error) => ({ error }));
          if (!("error" in ambient)) {
            result.candidatesDiscovered += ambient.candidates_found;
            result.candidatesRejected += ambient.rejected;
            result.candidatesPromoted += ambient.selected;
          }
        }
        result.summary = promoted.promoted > 0
          ? `Promoted ${promoted.promoted} qualified Holding item(s) into Active Radar.`
          : "Active Radar was thin; ran bounded discovery without padding weak items.";
        break;
      }
      case "holding_build":
      case "candidate_inbox_build":
      case "weekend_campaign":
      case "after_work_campaign":
      case "circle_event_campaign":
      case "north_priority_campaign": {
        const ambient = await runAmbientIntelligence({
          runType: input.operation === "weekend_campaign" ? "weekend_preview" : "radar_discovery",
          force: input.force,
          ownerUserId: input.userId,
        }).catch((error) => ({ error }));
        const inbox = await syncCandidateInboxFromExistingPipelines({
          userId: input.userId,
          supabase: input.supabase,
        });
        const providerGather = input.operation === "candidate_inbox_build"
          ? await runBootstrapProviderGather({
              userId: input.userId,
              context: input.context,
              supabase: input.supabase,
              maxCandidates: BOOTSTRAP_RUN_BUDGET.maxCandidatesCreated,
            })
          : { candidates: 0, sources: 0, errors: [] };
        result.candidatesDiscovered += inbox.created + inbox.updated;
        result.candidatesDiscovered += providerGather.candidates;
        result.sourcesCreated += providerGather.sources;
        if (providerGather.errors.length) result.errors = providerGather.errors;
        if (!("error" in ambient)) {
          result.candidatesDiscovered += ambient.candidates_found;
          result.candidatesRejected += ambient.rejected;
          result.candidatesPromoted += ambient.selected;
        }
        result.summary = `${input.operation} ran bounded discovery and synced Candidate Inbox.`;
        break;
      }
      case "library_build": {
        const scout = await runScout(input.userId);
        const conversion = await convertCandidateInboxToLibrary({
          userId: input.userId,
          supabase: input.supabase,
          limit: FOUNDATION_BATCH_BUDGET.maxLibraryItemsCreated,
        });
        const processed = await processCandidates(input.userId);
        const inbox = await syncCandidateInboxFromExistingPipelines({ userId: input.userId, supabase: input.supabase });
        result.candidatesDiscovered += scout.candidates_added + inbox.created + inbox.updated;
        result.sourcesCreated += scout.sources_added ?? 0;
        result.libraryItemsCreated += processed.researched + conversion.placesCreated + conversion.placesUpdated;
        result.eventsCreated = (result.eventsCreated ?? 0) + conversion.eventsCreated + conversion.eventsUpdated;
        result.sourcesCreated += conversion.sourcesCreated;
        result.candidatesRejected += processed.rejected + conversion.rejected;
        result.summary = `Library build ran Scout, converted ${conversion.placesCreated + conversion.placesUpdated} place(s), ${conversion.eventsCreated + conversion.eventsUpdated} event(s), and processed ${processed.researched} place candidate(s).`;
        result.errors = [...(processed.errors ?? []), ...conversion.errors];
        break;
      }
      case "library_refresh": {
        const refreshed = await processRefresh(5, input.supabase);
        result.libraryItemsRefreshed += refreshed.refreshed;
        result.summary = `Refreshed ${refreshed.refreshed} Library item(s); ${refreshed.updated} changed.`;
        break;
      }
      case "event_pulse_build": {
        const scout = await runEventScout(input.userId);
        const processed = await processEventCandidates(input.userId);
        result.candidatesDiscovered += scout.candidates_added;
        result.candidatesPromoted += processed.surfaced;
        result.candidatesHeld += processed.held;
        result.candidatesRejected += processed.rejected;
        result.summary = `Event Pulse found ${scout.candidates_added} candidate(s) and surfaced ${processed.surfaced}.`;
        result.eventsCreated = (result.eventsCreated ?? 0) + scout.candidates_added;
        if (processed.errors.length) result.errors = processed.errors;
        break;
      }
      case "source_building_campaign":
      case "source_expansion":
      case "source_recheck": {
        const due = await selectSourcesDueForCheck({ userId: input.userId, supabase: input.supabase, limit: 8 });
        for (const source of due) {
          const quality = scoreSourceQuality(source);
          await input.supabase
            .from("intelligence_sources")
            .update({
              trust_score: quality.score,
              taste_fit_score: quality.score,
              status: quality.status,
              cadence_hours: quality.cadenceHours,
              last_checked_at: new Date().toISOString(),
              next_check_at: quality.status === "muted" || quality.status === "retired"
                ? null
                : new Date(Date.now() + quality.cadenceHours * 60 * 60 * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", source.id)
            .eq("user_id", input.userId);
          if (quality.status === "watching") result.sourcesUpgraded++;
          if (quality.status === "cooldown") result.sourcesCooledDown++;
        }
        if (due.length === 0 && input.operation === "source_building_campaign") {
          const scout = await runScout(input.userId);
          result.candidatesDiscovered += scout.candidates_added;
        }
        result.sourcesChecked = due.length;
        result.summary = due.length > 0
          ? `Rechecked ${due.length} Source Graph source(s).`
          : "Source Graph was thin; ran Scout to discover new source candidates.";
        break;
      }
      case "promotion_review": {
        const promoted = await promoteHoldingWithService({
          userId: input.userId,
          supabase: input.supabase,
          slots: Math.max(0, RADAR_ACTIVE_ITEM_LIMIT - input.base.activeCount),
        });
        result.candidatesPromoted += promoted.promoted;
        result.candidatesHeld += promoted.reviewed - promoted.promoted;
        result.summary = `Manual review promoted ${promoted.promoted} qualified Holding item(s).`;
        break;
      }
      case "stale_cleanup":
      case "no_op":
      default:
        result.skipped = true;
        result.summary = "Radar, Holding, Candidate Inbox, Library, and Source Graph are healthy enough; no-op.";
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.summary = `Autopilot operation ${input.operation} failed safely: ${message}`;
    result.errors = [...(result.errors ?? []), message];
  }
  return result;
}

async function promoteHoldingWithService(input: {
  userId: string;
  supabase: SupabaseClient;
  slots: number;
}): Promise<{ reviewed: number; promoted: number }> {
  if (input.slots <= 0) return { reviewed: 0, promoted: 0 };
  const { data: activeRows } = await input.supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", input.userId)
    .eq("destination", "radar")
    .in("status", ["shown", "opened"])
    .limit(RADAR_ACTIVE_ITEM_LIMIT);
  const { data: holdingRows } = await input.supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", input.userId)
    .eq("destination", "holding")
    .in("status", ["discovered", "shown", "opened"])
    .order("score", { ascending: false, nullsFirst: false })
    .limit(40);
  const activeItems = ((activeRows ?? []) as SurfacedItemRow[]).map(rowToIndexedItem);
  const context = await buildJarvisContext({
    userId: input.userId,
    supabase: input.supabase,
    currentRadarItems: activeItems,
  });
  const selected: Array<{ id: string; score: number; payload: Json }> = [];
  for (const row of (holdingRows ?? []) as SurfacedItemRow[]) {
    const item = rowToIndexedItem(row);
    const radar = enrichRadarItem({ item, context });
    if (!isPromotableWhenUnderfilled(radar)) continue;
    selected.push({
      id: row.id,
      score: radar.score,
      payload: {
        ...(typeof row.payload === "object" && row.payload && !Array.isArray(row.payload) ? row.payload : {}),
        autopilot_promotion: {
          promoted_at: new Date().toISOString(),
          reason: radar.reasonSurfaced,
          score: radar.score,
        },
      } as Json,
    });
    if (selected.length >= input.slots) break;
  }
  for (const item of selected) {
    await input.supabase
      .from("surfaced_items")
      .update({
        destination: "radar",
        status: "shown",
        score: item.score,
        payload: item.payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("user_id", input.userId);
  }
  return {
    reviewed: (holdingRows ?? []).length,
    promoted: selected.length,
  };
}

async function runBootstrapProviderGather(input: {
  userId: string;
  context: FounderContextPacket;
  supabase: SupabaseClient;
  maxCandidates: number;
}): Promise<{ candidates: number; sources: number; errors: string[] }> {
  const lat = input.context.location.homeLat;
  const lng = input.context.location.homeLng;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return {
      candidates: 0,
      sources: 0,
      errors: ["Bootstrap provider gather skipped because home latitude/longitude are missing."],
    };
  }
  const errors: string[] = [];
  let candidates = 0;
  let sources = 0;
  try {
    const lanes = await gatherRadarCandidates({
      userId: input.userId,
      homeLat: lat,
      homeLng: lng,
      city: input.context.location.homeCity ?? undefined,
      state: input.context.location.homeState ?? undefined,
    });
    for (const lane of lanes) {
      for (const candidate of lane.candidates.slice(0, input.maxCandidates)) {
        const sourceId = await upsertSourceFromCandidate({
          userId: input.userId,
          sourceName: lane.source,
          candidate,
          supabase: input.supabase,
        });
        const status = await upsertCandidateInboxFromIndexedCandidate({
          userId: input.userId,
          source: lane.source,
          candidate,
          campaignId: "bootstrap:provider_gather",
          supabase: input.supabase,
        });
        if (sourceId) sources++;
        if (status === "created" || status === "updated") candidates++;
        if (candidates >= input.maxCandidates) break;
      }
      if (candidates >= input.maxCandidates) break;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { candidates, sources, errors };
}

function baseResult(
  operation: RadarAutopilotOperation,
  health: RadarAutopilotHealth,
  campaign?: RadarCampaign,
): RadarAutopilotResult {
  return {
    operation,
    activeCount: health.activeCount,
    holdingCount: health.holdingCount,
    candidateInboxCount: health.candidateInboxCount,
    libraryCounts: {
      places: health.library.places,
      events: health.library.events,
      sources: health.sourceCount,
      organizations: health.library.organizations,
      people: health.library.people,
      recurringSignals: health.library.recurringSignals,
    },
    sourcesChecked: 0,
    candidatesDiscovered: 0,
    candidatesRejected: 0,
    candidatesHeld: 0,
    candidatesPromoted: 0,
    libraryItemsCreated: 0,
    libraryItemsRefreshed: 0,
    sourcesCreated: 0,
    sourcesUpgraded: 0,
    sourcesCooledDown: 0,
    summary: `Selected ${operation}.`,
    campaign,
    libraryBefore: libraryCountsFromHealth(health),
  };
}

function mergeResult(target: RadarAutopilotResult, partial: RadarAutopilotResult) {
  target.sourcesChecked += partial.sourcesChecked;
  target.candidatesDiscovered += partial.candidatesDiscovered;
  target.candidatesRejected += partial.candidatesRejected;
  target.candidatesHeld += partial.candidatesHeld;
  target.candidatesPromoted += partial.candidatesPromoted;
  target.libraryItemsCreated += partial.libraryItemsCreated;
  target.libraryItemsRefreshed += partial.libraryItemsRefreshed;
  target.sourcesCreated += partial.sourcesCreated;
  target.sourcesUpgraded += partial.sourcesUpgraded;
  target.sourcesCooledDown += partial.sourcesCooledDown;
}

function foundationSummary(input: {
  stack: RadarAutopilotOperation[];
  result: RadarAutopilotResult;
  missingProviders: string[];
  sprint?: boolean;
  missions?: string[];
}): string {
  if (input.stack.length === 0) {
    return input.sprint
      ? "Foundation Sprint had no runnable mission in this batch. Check provider keys or target health."
      : "Foundation build had no safe operation to run.";
  }
  const workDone =
    input.result.sourcesChecked +
    input.result.candidatesDiscovered +
    input.result.libraryItemsCreated +
    input.result.libraryItemsRefreshed +
    input.result.sourcesCreated +
    input.result.candidatesHeld +
    input.result.candidatesPromoted;
  if (workDone === 0 && input.missingProviders.length > 0) {
    const providerSummary = input.result.providerStatus
      ? bootstrapProviderSummary(input.result.providerStatus)
      : null;
    return `Foundation build needed, but external discovery is blocked or limited. ${providerSummary ?? `Configure ${input.missingProviders.join(", ")} to build the intelligence bank from real sources.`}`;
  }
  const label = input.sprint ? "Foundation Sprint" : "Foundation build";
  const missionText = input.missions?.length ? ` Missions: ${input.missions.join(", ")}.` : "";
  const partial = input.result.errors?.length ? ` Partial success with ${input.result.errors.length} error(s).` : "";
  return `${label} ran ${input.stack.length} operation(s): ${input.stack.join(", ")}.${missionText} Discovered ${input.result.candidatesDiscovered}, created ${input.result.libraryItemsCreated} place/library item(s), created ${input.result.eventsCreated ?? 0} event(s), added ${input.result.sourcesCreated} source(s), checked ${input.result.sourcesChecked} source(s), promoted ${input.result.candidatesPromoted}.${partial}`;
}

function libraryCountsFromHealth(health: RadarAutopilotHealth): NonNullable<RadarAutopilotResult["libraryCounts"]> {
  return {
    places: health.library.places,
    events: health.library.events,
    sources: health.sourceCount,
    organizations: health.library.organizations,
    people: health.library.people,
    recurringSignals: health.library.recurringSignals,
  };
}

function countsFromHealth(health: RadarAutopilotHealth): Json {
  return {
    active: health.activeCount,
    holding: health.holdingCount,
    candidateInbox: health.candidateInboxCount,
    library: libraryCountsFromHealth(health),
    tierA: health.library.tierA,
    tierB: health.library.tierB,
    tierC: health.library.tierC,
    needsRefresh: health.library.needsRefresh,
    rejectedMuted: health.library.rejectedMuted,
  };
}

function missingProviders(status: SourceHealth): string[] {
  return Object.entries(status)
    .filter(([, value]) => value !== "available")
    .map(([key]) => key);
}

function isWeekendWindow(now: Date): boolean {
  const day = now.getDay();
  return day === 4 || day === 5 || day === 6;
}
