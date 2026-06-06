import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFounderContextPacket } from "@/lib/context/founderContextPacket";
import {
  buildContextTraceSummary,
  safeWriteIntelligenceTrace,
  writeIntelligenceTraceWithClient,
} from "@/lib/brain/intelligenceTrace";
import { buildIntelligenceReason } from "@/lib/brain/intelligenceReason";
import { runCategoryScout } from "@/lib/brain/categoryAgents";
import { runEventScout } from "@/lib/brain/eventScout";
import { processCandidates } from "@/lib/intelligence/libraryWorker";
import { processEventCandidates } from "@/lib/intelligence/eventWorker";
import { cleanupRadar } from "@/lib/intelligence/radarCleanup";
import { processRefresh } from "@/lib/brain/refresher";
import { enrichPending } from "@/lib/library/enrichPending";
import { runAmbientIntelligence } from "@/lib/intelligence/ambientRuns";
import { buildJarvisContext } from "@/lib/intelligence/context";
import { enrichRadarItem } from "@/lib/intelligence/core";
import {
  isPromotableWhenUnderfilled,
  mergeRadarIntelligencePayload,
} from "@/lib/intelligence/radarCurator";
import { evaluateActiveRadarItem } from "@/lib/intelligence/radarFrontRoom";
import { normalizeRadarCategory } from "@/lib/radar/category";
import { categoryDataReady, type HoldReason } from "@/lib/brain/categoryCouncils";
import { assessFindBudget, findIsReady, type BudgetTier, type ProductDossier } from "@/lib/brain/productResearcher";
import { runExecutiveCouncil, type ExecutiveCandidate, type ExecutiveDecision } from "@/lib/brain/executiveCouncil";
import { materializeEligibleLibraryItems } from "@/lib/radar/libraryMaterializer";
import { planLivingFive, type LivingFiveMember } from "@/lib/radar/livingFive";
import { preBuildPlansForShownItems } from "@/lib/radar/planPreBuilder";
import {
  blendRadarComposite,
  deriveCompositeDimensions,
  haversineMiles,
} from "@/lib/scoring/radarComposite";
import { rowToIndexedItem } from "@/lib/index/repo";
import { readLibraryHealth, type LibraryHealth } from "@/lib/library";
import {
  selectSourcesDueForCheck,
  scoreSourceQuality,
  sourceKeyForItem,
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
  createRunBudget,
  DEFAULT_RUN_BUDGET_MS,
  FOUNDATION_BATCH_BUDGET,
  FOUNDATION_SPRINT_TARGETS,
  FOUNDATION_PROMOTION_RESERVE_MS,
  FOUNDATION_RUN_BUDGET_MS,
  foundationWorkDone,
  isCandidateInboxNearTarget,
  nextMissionCursor,
  type RunBudget,
  selectFoundationMissions,
} from "@/lib/radar/foundationSprint";
import { readRadarPromotionDiagnostics } from "@/lib/radar/promotionDiagnostics";
import { describeSourceHealth, gatherRadarCandidates } from "@/lib/sources/gather";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  RADAR_ACTIVE_ITEM_LIMIT,
  RADAR_MIN_ACTIVE_ITEM_TARGET,
  RADAR_LIVING_FIVE_PER_CATEGORY,
  RADAR_PROMOTIONS_PER_RUN,
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
  budget?: AutopilotSpendBudgetSnapshot;
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
  timeBudgetReached?: boolean;
  timeRemainingMs?: number;
};

const AUTOPILOT_PAID_PROVIDER_CALLS_PER_DAY_ENV = "RADAR_AUTOPILOT_MAX_PAID_PROVIDER_CALLS_PER_DAY";
const AUTOPILOT_CLAUDE_TOKENS_PER_DAY_ENV = "RADAR_AUTOPILOT_MAX_CLAUDE_TOKENS_PER_DAY";
const AUTOPILOT_PAID_PROVIDER_CALLS_PER_RUN_ENV = "RADAR_AUTOPILOT_MAX_PAID_PROVIDER_CALLS_PER_RUN";
const AUTOPILOT_CLAUDE_TOKENS_PER_RUN_ENV = "RADAR_AUTOPILOT_MAX_CLAUDE_TOKENS_PER_RUN";
const DEFAULT_AUTOPILOT_PAID_PROVIDER_CALLS_PER_DAY = 80;
const DEFAULT_AUTOPILOT_CLAUDE_TOKENS_PER_DAY = 200_000;
const DEFAULT_AUTOPILOT_PAID_PROVIDER_CALLS_PER_RUN = 6;
const DEFAULT_AUTOPILOT_CLAUDE_TOKENS_PER_RUN = 25_000;
const AMBIENT_INTELLIGENCE_CLAUDE_TOKEN_ESTIMATE = 8_000;

type AutopilotSpendBudget = {
  paidProviderCallsPerDay: number;
  claudeTokensPerDay: number;
  paidProviderCallsPerRun: number;
  claudeTokensPerRun: number;
  paidProviderCallsUsedToday: number;
  claudeTokensUsedToday: number;
  paidProviderCallsThisRun: number;
  claudeTokensThisRun: number;
  skipped: string[];
};

type AutopilotSpendBudgetSnapshot = ReturnType<typeof budgetSnapshot>;

export async function runRadarAutopilot(input: {
  userId: string;
  mode?: RadarAutopilotMode;
  force?: boolean;
  supabase?: SupabaseClient;
}): Promise<RadarAutopilotResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
  const mode = normalizeAutopilotMode(input.mode);
  const runBudget = createRunBudget(mode === "foundation_sprint" ? FOUNDATION_RUN_BUDGET_MS : DEFAULT_RUN_BUDGET_MS);
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
  const spendBudget = await readAutopilotSpendBudget({
    userId: input.userId,
    supabase,
  });
  if (mode === "foundation_sprint" && !settings.foundation_sprint_enabled && !input.force) {
    return {
      ...baseResult("no_op", health, campaigns[0]),
      mode,
      bootstrapNeeded: bootstrap.needed,
      bootstrap,
      providerStatus,
      missingProviders: missing,
      budget: budgetSnapshot(spendBudget),
      skipped: true,
      runStatus: "paused",
      summary: "Foundation Sprint is off. Cron no-op.",
    };
  }
  if (mode === "foundation_sprint" && foundation.completed && health.activeCount >= RADAR_MIN_ACTIVE_ITEM_TARGET && health.discoveredBacklogCount === 0) {
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
      budget: budgetSnapshot(spendBudget),
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
    paused.budget = budgetSnapshot(spendBudget);
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
  base.budget = budgetSnapshot(spendBudget);
  const runId = await createAutopilotRun({
    userId: input.userId,
    mode,
    operation,
    providerStatus: providerStatus as Json,
    missingProviders: missing as Json,
    countsBefore: countsFromHealth(health),
    supabase,
  });
  await logAutopilotActivity({
    userId: input.userId,
    runId,
    level: "info",
    message: "Autopilot spend budget loaded.",
    metadata: {
      ...budgetSnapshot(spendBudget),
      env: {
        paid_provider_calls_per_day: AUTOPILOT_PAID_PROVIDER_CALLS_PER_DAY_ENV,
        claude_tokens_per_day: AUTOPILOT_CLAUDE_TOKENS_PER_DAY_ENV,
        paid_provider_calls_per_run: AUTOPILOT_PAID_PROVIDER_CALLS_PER_RUN_ENV,
        claude_tokens_per_run: AUTOPILOT_CLAUDE_TOKENS_PER_RUN_ENV,
      },
    },
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
    runBudget,
    spendBudget,
  });
  result.runId = runId;
  result.timeRemainingMs = runBudget.timeRemainingMs();
  result.budget = budgetSnapshot(spendBudget);
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
    : result.timeBudgetReached && didUsefulWork
      ? "partial_success"
      : result.timeBudgetReached
        ? "blocked"
        : result.errors?.length && didUsefulWork
          ? "partial_success"
          : result.summary.includes("failed safely")
            ? "failed"
            : result.bootstrapNeeded && result.candidatesDiscovered === 0 && result.sourcesCreated === 0 && result.libraryItemsCreated === 0 && missing.length >= 5
              ? "blocked"
              : "succeeded";
  result.runStatus = runStatus;
  await logAutopilotActivity({
    userId: input.userId,
    runId,
    level: "info",
    message: "Autopilot spend reserved for this run.",
    metadata: {
      paid_provider_calls: result.budget?.paidProviderCallsThisRun ?? 0,
      claude_tokens_estimate: result.budget?.claudeTokensThisRun ?? 0,
      budget: result.budget ?? {},
    },
    supabase,
  });
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
        budget: result.budget,
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
    discoveredRes,
    inboxRes,
    sourceRes,
    eventFreshRes,
    library,
    dueSources,
  ] = await Promise.all([
    input.supabase.from("surfaced_items").select("*").eq("user_id", input.userId).eq("destination", "radar").in("status", ["shown", "opened"]).limit(RADAR_ACTIVE_ITEM_LIMIT * 2),
    input.supabase.from("surfaced_items").select("id", { count: "exact", head: true }).eq("user_id", input.userId).eq("destination", "holding").in("status", ["discovered", "shown", "opened"]),
    input.supabase.from("surfaced_items").select("id", { count: "exact", head: true }).eq("user_id", input.userId).eq("status", "discovered"),
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
  const activeRows = (activeRes.data ?? []) as SurfacedItemRow[];
  const visibleActiveCount = activeRows
    .map(rowToIndexedItem)
    .filter(isActiveRadarInventoryItem)
    .length;
  return {
    activeCount: visibleActiveCount,
    holdingCount: holdingRes.count ?? 0,
    discoveredBacklogCount: discoveredRes.count ?? 0,
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
  runBudget: RunBudget;
  spendBudget: AutopilotSpendBudget;
}): Promise<RadarAutopilotResult> {
  const result = { ...input.base };
  try {
    switch (input.operation) {
      case "foundation_build_mode": {
        const isSprint = input.base.mode === "foundation_sprint";
        const currentSettings = isSprint
          ? await ensureAutopilotSettings({
              userId: input.userId,
              supabase: input.supabase,
            })
          : null;
        const cursor = Number(currentSettings?.foundation_sprint_mission_cursor ?? 0);
        const missions = isSprint
          ? selectFoundationMissions({
              health: input.health,
              providerStatus: input.providerStatus,
              cursor,
              maxOperations: FOUNDATION_BATCH_BUDGET.maxOperations,
            })
          : [];
        const rawStack = isSprint
          ? missions.map((mission) => mission.operation)
          : foundationOperationStack({
              health: input.health,
              maxOperations: BOOTSTRAP_RUN_BUDGET.maxCampaigns,
            });
        const stack = orderPromotionFirst(rawStack);
        const errors: string[] = [];
        for (const [idx, operation] of stack.entries()) {
          if (input.runBudget.shouldStopSoon()) {
            result.timeBudgetReached = true;
            result.summary = "Time budget reached before starting the next Foundation Sprint step. Partial progress saved; continuing on the next scheduled run.";
            await logAutopilotActivity({
              userId: input.userId,
              runId: input.runId,
              level: "warning",
              message: "Time budget reached before starting the next Foundation Sprint step. Continuing next run.",
              metadata: { timeRemainingMs: input.runBudget.timeRemainingMs() },
              supabase: input.supabase,
            });
            break;
          }
          if (
            operation !== "promotion_review" &&
            stack.slice(idx).includes("promotion_review") &&
            input.runBudget.timeRemainingMs() <= FOUNDATION_PROMOTION_RESERVE_MS
          ) {
            result.timeBudgetReached = true;
            result.summary = "Time budget reserved for Promotion Review. Continuing intake on the next scheduled run.";
            await logAutopilotActivity({
              userId: input.userId,
              runId: input.runId,
              level: "warning",
              message: result.summary,
              metadata: { timeRemainingMs: input.runBudget.timeRemainingMs(), operation },
              supabase: input.supabase,
            });
            break;
          }
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
          if (mission) {
            const availableProviders = Object.entries(input.providerStatus)
              .filter(([, status]) => status === "available")
              .map(([provider]) => provider);
            await logAutopilotActivity({
              userId: input.userId,
              runId: input.runId,
              level: availableProviders.length > 0 ? "info" : "warning",
              message: availableProviders.length > 0
                ? `Provider availability: ${availableProviders.join(", ")}.`
                : "Provider availability: no external discovery providers configured for this mission.",
              metadata: { providers: input.providerStatus, mission: mission.type },
              supabase: input.supabase,
            });
          }
          const partial = await executeOperation({
            ...input,
            operation,
            base: baseResult(operation, input.health, input.campaigns[0]),
          });
          mergeResult(result, partial);
          result.timeBudgetReached = Boolean(result.timeBudgetReached || partial.timeBudgetReached);
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
          if (isSprint) {
            await advanceFoundationMissionCursor({
              userId: input.userId,
              cursor: nextMissionCursor(cursor, idx + 1),
              supabase: input.supabase,
            });
          }
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
          if (input.runBudget.shouldStopSoon() || partial.timeBudgetReached) {
            result.timeBudgetReached = true;
            result.summary = "Time budget reached. Partial progress saved. Continuing on the next scheduled run.";
            await logAutopilotActivity({
              userId: input.userId,
              runId: input.runId,
              level: "warning",
              message: "Time budget reached. Partial progress saved. Continuing on the next scheduled run.",
              metadata: { timeRemainingMs: input.runBudget.timeRemainingMs(), operation, mission: mission?.type ?? null },
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
          slots: RADAR_PROMOTIONS_PER_RUN,
          runId: input.runId,
        });
        result.candidatesPromoted += promoted.promoted;
        result.candidatesHeld += promoted.reviewed - promoted.promoted;
        if (promoted.promoted === 0) {
          const ambient = reserveClaudeTokens(input.spendBudget, AMBIENT_INTELLIGENCE_CLAUDE_TOKEN_ESTIMATE, "front_room_refill_ambient")
            ? await runAmbientIntelligence({
                runType: "radar_discovery",
                force: input.force,
                ownerUserId: input.userId,
              }).catch((error) => ({ error }))
            : { skipped: true as const };
          if (!("error" in ambient) && !("skipped" in ambient)) {
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
        const isSprint = input.base.mode === "foundation_sprint";
        const ambient = isSprint || input.runBudget.shouldStopSoon()
          || !reserveClaudeTokens(input.spendBudget, AMBIENT_INTELLIGENCE_CLAUDE_TOKEN_ESTIMATE, "campaign_ambient")
          ? { skipped: true as const }
          : await runAmbientIntelligence({
              runType: input.operation === "weekend_campaign" ? "weekend_preview" : "radar_discovery",
              force: input.force,
              ownerUserId: input.userId,
            }).catch((error) => ({ error }));
        const skipInboxDiscovery = isSprint && isCandidateInboxNearTarget(input.health);
        const inbox = skipInboxDiscovery
          ? { created: 0, updated: 0 }
          : await syncCandidateInboxFromExistingPipelines({
              userId: input.userId,
              supabase: input.supabase,
            });
        const maxCandidates = isSprint
          ? Math.max(0, Math.min(
              FOUNDATION_BATCH_BUDGET.maxCandidatesCreated,
              FOUNDATION_SPRINT_TARGETS.candidateInbox - input.health.candidateInboxCount,
            ))
          : BOOTSTRAP_RUN_BUDGET.maxCandidatesCreated;
        const providerGather = input.operation === "candidate_inbox_build" && !skipInboxDiscovery && maxCandidates > 0
          ? await runBootstrapProviderGather({
              userId: input.userId,
              context: input.context,
              supabase: input.supabase,
              maxCandidates,
              maxSources: isSprint ? FOUNDATION_BATCH_BUDGET.maxSourcesCreated : undefined,
              budget: input.runBudget,
              spendBudget: input.spendBudget,
              providerStatus: input.providerStatus,
            })
          : { candidates: 0, sources: 0, errors: [], timeBudgetReached: false };
        result.candidatesDiscovered += inbox.created;
        result.candidatesDiscovered += providerGather.candidates;
        result.sourcesCreated += providerGather.sources;
        result.timeBudgetReached = Boolean(providerGather.timeBudgetReached);
        if (providerGather.errors.length) result.errors = providerGather.errors;
        if (!("error" in ambient) && !("skipped" in ambient)) {
          result.candidatesDiscovered += ambient.candidates_found;
          result.candidatesRejected += ambient.rejected;
          result.candidatesPromoted += ambient.selected;
        }
        result.summary = result.timeBudgetReached
          ? `${input.operation} saved partial intake before the time budget.`
          : skipInboxDiscovery
            ? `${input.operation} skipped discovery because Candidate Inbox is near target; budget is reserved for promotion and conversion.`
            : `${input.operation} ran bounded discovery and synced Candidate Inbox.`;
        break;
      }
      case "library_build": {
        const isSprint = input.base.mode === "foundation_sprint";
        const scout = isSprint || input.runBudget.shouldStopSoon()
          || !reserveClaudeTokens(input.spendBudget, AMBIENT_INTELLIGENCE_CLAUDE_TOKEN_ESTIMATE, "library_scout")
          ? { candidates_added: 0, sources_added: 0, week_shape: null as string | null, nothing_categories: [] as string[] }
          : await runCategoryScout({ userId: input.userId, supabase: input.supabase });
        const conversion = await convertCandidateInboxToLibrary({
          userId: input.userId,
          supabase: input.supabase,
          limit: isSprint ? FOUNDATION_BATCH_BUDGET.maxLibraryItemsCreated : 30,
          budget: input.runBudget,
        });
        const processed = isSprint || input.runBudget.shouldStopSoon()
          ? { researched: 0, rejected: 0, errors: [] as string[] }
          : await processCandidates(input.userId);
        // Fill location/hours/photo on freshly-researched Library rows and flip
        // them to enrichment_status="enriched" so the materializer can surface
        // them. Without this step researched rows never become Radar-eligible.
        const enriched = input.runBudget.shouldStopSoon()
          ? { enriched: 0, scanned: 0 }
          : await enrichPending(input.userId, 12).catch((err) => {
              result.errors = [
                ...(result.errors ?? []),
                `enrichPending failed: ${err instanceof Error ? err.message : String(err)}`,
              ];
              return { enriched: 0, scanned: 0 };
            });
        const inbox = input.runBudget.shouldStopSoon()
          ? { created: 0, updated: 0 }
          : await syncCandidateInboxFromExistingPipelines({ userId: input.userId, supabase: input.supabase });
        result.candidatesDiscovered += scout.candidates_added + inbox.created;
        result.sourcesCreated += scout.sources_added ?? 0;
        result.libraryItemsCreated += processed.researched + conversion.placesCreated + conversion.placesUpdated + conversion.styleSurfaced;
        result.eventsCreated = (result.eventsCreated ?? 0) + conversion.eventsCreated + conversion.eventsUpdated;
        result.sourcesCreated += conversion.sourcesCreated;
        result.candidatesRejected += processed.rejected + conversion.rejected;
        result.timeBudgetReached = conversion.timeBudgetReached || input.runBudget.shouldStopSoon();
        result.summary = result.timeBudgetReached
          ? `Library conversion saved partial progress: researched ${conversion.placesCreated + conversion.placesUpdated} place(s), ${conversion.eventsCreated} event(s), surfaced ${conversion.styleSurfaced} style item(s). Continuing next run.`
          : `Library build ran ${scout.candidates_added} category-agent candidate(s)${scout.nothing_categories.length ? ` (quiet: ${scout.nothing_categories.join(", ")})` : ""}, researched ${conversion.placesCreated + conversion.placesUpdated} place(s), queued ${conversion.eventsCreated} event(s), surfaced ${conversion.styleSurfaced} style item(s), enriched ${enriched.enriched}/${enriched.scanned}, and processed ${processed.researched} place candidate(s).${scout.week_shape ? ` Week shape: ${scout.week_shape}` : ""}`;
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
        if (input.base.mode === "foundation_sprint") {
          if (input.runBudget.shouldStopSoon()) {
            result.timeBudgetReached = true;
            result.summary = "Event Pulse mission deferred because the run time budget is nearly spent.";
            break;
          }
          const providerGather = await runBootstrapProviderGather({
            userId: input.userId,
            context: input.context,
            supabase: input.supabase,
            maxCandidates: FOUNDATION_BATCH_BUDGET.maxCandidatesCreated,
            maxSources: FOUNDATION_BATCH_BUDGET.maxSourcesCreated,
            budget: input.runBudget,
            spendBudget: input.spendBudget,
            providerStatus: input.providerStatus,
          });
          result.candidatesDiscovered += providerGather.candidates;
          result.sourcesCreated += providerGather.sources;
          result.timeBudgetReached = providerGather.timeBudgetReached;
          if (providerGather.errors.length) result.errors = providerGather.errors;
          const surfaced = input.runBudget.shouldStopSoon()
            ? { surfaced: 0, held: 0, rejected: 0, errors: [] as string[] }
            : await processEventCandidates(input.userId, 8);
          result.candidatesPromoted += surfaced.surfaced;
          result.candidatesHeld += surfaced.held;
          result.candidatesRejected += surfaced.rejected;
          if (surfaced.errors.length) result.errors = [...(result.errors ?? []), ...surfaced.errors];
          result.summary = result.timeBudgetReached
            ? "Event Pulse intake saved partial results before the time budget."
            : `Event Pulse intake created ${providerGather.candidates} candidate(s) and surfaced ${surfaced.surfaced} event(s).`;
          break;
        }
        const scout = await runEventScout(input.userId);
        const processed = input.runBudget.shouldStopSoon()
          ? { surfaced: 0, held: 0, rejected: 0, errors: [] as string[] }
          : await processEventCandidates(input.userId, 5);
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
        const due = await selectSourcesDueForCheck({
          userId: input.userId,
          supabase: input.supabase,
          limit: input.base.mode === "foundation_sprint" ? FOUNDATION_BATCH_BUDGET.maxProviderCalls : 8,
        });
        for (const source of due) {
          if (input.runBudget.shouldStopSoon()) {
            result.timeBudgetReached = true;
            result.summary = "Time budget reached during Source Graph recheck. Partial source progress saved.";
            break;
          }
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
        if (!result.timeBudgetReached && due.length === 0 && input.operation === "source_building_campaign") {
          if (input.base.mode === "foundation_sprint") {
            const providerGather = await runBootstrapProviderGather({
              userId: input.userId,
              context: input.context,
              supabase: input.supabase,
              maxCandidates: FOUNDATION_BATCH_BUDGET.maxCandidatesCreated,
              maxSources: FOUNDATION_BATCH_BUDGET.maxSourcesCreated,
              budget: input.runBudget,
              spendBudget: input.spendBudget,
              providerStatus: input.providerStatus,
            });
            result.candidatesDiscovered += providerGather.candidates;
            result.sourcesCreated += providerGather.sources;
            result.timeBudgetReached = providerGather.timeBudgetReached;
            if (providerGather.errors.length) result.errors = providerGather.errors;
          } else {
            if (reserveClaudeTokens(input.spendBudget, AMBIENT_INTELLIGENCE_CLAUDE_TOKEN_ESTIMATE, "source_building_scout")) {
              const scout = await runCategoryScout({ userId: input.userId, supabase: input.supabase });
              result.candidatesDiscovered += scout.candidates_added;
            }
          }
        }
        result.sourcesChecked = due.length;
        result.summary = result.timeBudgetReached
          ? result.summary
          : due.length > 0
          ? `Rechecked ${due.length} Source Graph source(s).`
          : input.base.mode === "foundation_sprint"
            ? `Source building intake created ${result.candidatesDiscovered} candidate(s) and ${result.sourcesCreated} source(s).`
            : "Source Graph was thin; ran Scout to discover new source candidates.";
        break;
      }
      case "promotion_review": {
        // Bridge: convert strong Library inventory into the surfaced pool before promoting.
        const materialized = await materializeEligibleLibraryItems(input.userId);
        if (materialized.materialized > 0) {
          result.summary += `Materialized ${materialized.materialized} library item(s) into promotion pool. `;
        }
        if (materialized.errors.length) result.errors = [...(result.errors ?? []), ...materialized.errors];
        const diagnostics = await readRadarPromotionDiagnostics({
          userId: input.userId,
          supabase: input.supabase,
          limit: 16,
        });
        const eligibleDiagnostics = diagnostics.items.filter((item) => item.radarEligible);
        // Living-5: promotion runs per-category, so the change budget is a bounded
        // per-run cap — not suppressed by the global active count. Empty categories
        // fill even when other categories are already at five.
        const slots = RADAR_PROMOTIONS_PER_RUN;
        await logAutopilotActivity({
          userId: input.userId,
          runId: input.runId,
          level: "info",
          message: `Promotion review considered ${diagnostics.items.length} item(s): ${diagnostics.summary}`,
          metadata: {
            activeCount: diagnostics.activeCount,
            target: diagnostics.target,
            eligible: eligibleDiagnostics.length,
            slots,
            blockers: diagnostics.items
              .filter((item) => !item.radarEligible)
              .slice(0, 8)
              .map((item) => ({
                title: item.title,
                source_layer: item.sourceLayer,
                blockers: item.blockers.slice(0, 3),
                next_step: item.nextStep,
              })),
          },
          supabase: input.supabase,
        });
        const promoted = await promoteHoldingWithService({
          userId: input.userId,
          supabase: input.supabase,
          slots,
          runId: input.runId,
        });
        result.candidatesPromoted += promoted.promoted;
        result.candidatesHeld += promoted.reviewed - promoted.promoted;
        if (eligibleDiagnostics.length > 0 && promoted.promoted === 0) {
          const blocker = slots <= 0
            ? `Active Radar is at or above target (${input.base.activeCount}/${RADAR_MIN_ACTIVE_ITEM_TARGET}).`
            : promoted.reasons[0] ?? "Eligible item was not selected by the final Holding promotion pass.";
          await logAutopilotActivity({
            userId: input.userId,
            runId: input.runId,
            level: "warning",
            message: `Promotion review found ${eligibleDiagnostics.length} eligible item(s) but promoted 0. Final blocker: ${blocker}`,
            metadata: {
              eligible: eligibleDiagnostics.map((item) => ({
                title: item.title,
                source_layer: item.sourceLayer,
                score: item.score,
              })),
              final_blocker: blocker,
            },
            supabase: input.supabase,
          });
        }
        result.summary = promoted.promoted > 0
          ? `${result.summary}Promotion review promoted ${promoted.promoted} qualified Holding item(s).`
          : `${result.summary}Promotion review promoted 0 items. ${diagnostics.summary}`;
        // Pre-build plans for newly-shown Radar items so they open instantly.
        // Radar only surfaces items whose plan is fully built, so build several
        // per run to keep the gated feed full autonomously. Bounded by runBudget.
        if (!input.runBudget.shouldStopSoon()) {
          const preBuild = await preBuildPlansForShownItems(
            input.userId,
            input.supabase,
            { maxItems: 6 },
          );
          if (preBuild.built > 0) {
            result.summary += ` Pre-built ${preBuild.built} plan(s).`;
          }
          if (preBuild.errors.length) {
            result.errors = [...(result.errors ?? []), ...preBuild.errors];
          }
        }
        break;
      }
      case "stale_cleanup": {
        const cleanup = await cleanupRadar(input.userId, { supabase: input.supabase });
        result.summary = [
          cleanup.archived > 0 ? `Archived ${cleanup.archived}` : "",
          cleanup.moved_to_discovered > 0 ? `Demoted ${cleanup.moved_to_discovered} stale` : "",
          cleanup.deduped > 0 ? `Deduped ${cleanup.deduped}` : "",
        ]
          .filter(Boolean)
          .join(", ") || "Stale cleanup ran — board is clean.";
        result.candidatesRejected += cleanup.archived;
        break;
      }
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

/**
 * The category promotion service. Maintains the top 7 strongest fits per
 * category on Radar, by composite score (lib/scoring/radarComposite), with
 * displacement of the weakest sitting member when a stronger candidate appears.
 * The Decision Council gate (isPromotableWhenUnderfilled) remains the sole
 * arbiter of eligibility — the category planner only chooses *which* eligible
 * items occupy each lane's slots. Never empty (if real fits exist), never padded.
 */
async function promoteHoldingWithService(input: {
  userId: string;
  supabase: SupabaseClient;
  slots: number;
  runId?: string | null;
}): Promise<{ reviewed: number; promoted: number; reasons: string[] }> {
  const changeBudget = input.slots;
  if (changeBudget <= 0) return { reviewed: 0, promoted: 0, reasons: ["No promotion budget this run."] };
  const { data: activeRows } = await input.supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", input.userId)
    .eq("destination", "radar")
    .in("status", ["shown", "opened"])
    .limit(RADAR_ACTIVE_ITEM_LIMIT);
  const { data: backlogRows } = await input.supabase
    .from("surfaced_items")
    .select("*")
    .eq("user_id", input.userId)
    .in("status", ["discovered", "shown", "opened"])
    .order("score", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(80);
  const activeRowList = ((activeRows ?? []) as SurfacedItemRow[]).filter((row) =>
    isActiveRadarInventoryItem(rowToIndexedItem(row)),
  );
  const context = await buildJarvisContext({
    userId: input.userId,
    supabase: input.supabase,
    currentRadarItems: activeRowList.map(rowToIndexedItem),
  });
  const userLat = typeof context.homeLat === "number" ? context.homeLat : null;
  const userLng = typeof context.homeLng === "number" ? context.homeLng : null;

  const reasons: string[] = [];

  // ── Sitting members: the current per-category board ──────────────────────────
  const activeMembers: LivingFiveMember[] = [];
  const activeMeta = new Map<string, { row: SurfacedItemRow; status: string }>();
  for (const row of activeRowList) {
    const item = rowToIndexedItem(row);
    const radar = enrichRadarItem({ item, context });
    const category = normalizeRadarCategory(item.category ?? radar.category);
    if (!category) continue; // uncategorized legacy item — not in any category lane
    activeMembers.push({
      id: row.id,
      category,
      composite: compositeFor(radar, item, userLat, userLng),
      eligible: true,
    });
    activeMeta.set(row.id, { row, status: row.status });
  }

  // ── Challengers: eligible Holding / discovered candidates ────────────────────
  const reviewedRows = ((backlogRows ?? []) as SurfacedItemRow[])
    .filter((row) => {
      if (row.destination === "radar" && (row.status === "shown" || row.status === "opened")) return false;
      if (row.status === "discovered") return true;
      return row.destination === "holding";
    })
    .slice(0, 40);
  const candidateIds = reviewedRows.map((row) => row.id);
  const candidateMembers: LivingFiveMember[] = [];
  const candidateMeta = new Map<string, { row: SurfacedItemRow; radar: ReturnType<typeof enrichRadarItem>; composite: number }>();
  const gateRejectedIds: string[] = [];
  const heldByGate: Array<{ id: string; holdReasons: HoldReason[] }> = [];
  for (const row of reviewedRows) {
    const item = rowToIndexedItem(row);
    const radar = enrichRadarItem({ item, context });
    const category = normalizeRadarCategory(item.category ?? radar.category);
    if (!category || !isPromotableWhenUnderfilled(radar)) {
      reasons.push(`${item.title}: ${radar.radarDisposition} · score ${radar.score.toFixed(2)} · confidence ${radar.confidence.toFixed(2)}.`);
      gateRejectedIds.push(row.id);
      continue;
    }
    // Phase 2 guardrail: block true stubs (minimum useful data, not perfect).
    const readiness = categoryDataReady(item, category);
    if (!readiness.ready) {
      reasons.push(`${item.title}: held — ${readiness.holdReasons.join(", ")}.`);
      console.warn("[radar.guardrail] held", { itemId: row.id, category, holdReasons: readiness.holdReasons });
      heldByGate.push({ id: row.id, holdReasons: readiness.holdReasons });
      gateRejectedIds.push(row.id);
      continue;
    }
    const composite = compositeFor(radar, item, userLat, userLng);
    candidateMembers.push({ id: row.id, category, composite, eligible: true, timelyValid: !isStaleForRadar(item) });
    candidateMeta.set(row.id, { row, radar, composite });
  }

  // Persist hold reasons for debugging (SQL-inspectable).
  if (heldByGate.length > 0) {
    await Promise.all(
      heldByGate.map(({ id, holdReasons }) => {
        const row = reviewedRows.find((r) => r.id === id);
        const base =
          row?.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, unknown>)
            : {};
        return input.supabase
          .from("surfaced_items")
          .update({ payload: { ...base, hold_reasons: holdReasons }, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", input.userId);
      }),
    );
  }

  // ── Executive Council: cross-category attention order + user-intent boost ─────
  // One LLM pass per cycle. Drops hold/archive, nudges composites so the items
  // that deserve attention now (and explicit asks) win contested slots.
  const execMeta = new Map<string, ExecutiveDecision>();
  if (candidateMembers.length >= 2) {
    const shortlist: ExecutiveCandidate[] = candidateMembers.map((m) => {
      const meta = candidateMeta.get(m.id)!;
      const pl =
        meta.row.payload && typeof meta.row.payload === "object" && !Array.isArray(meta.row.payload)
          ? (meta.row.payload as Record<string, unknown>)
          : {};
      return {
        id: m.id,
        category: m.category,
        title: meta.row.title ?? meta.radar.item.title,
        laneScore: Math.max(0, Math.min(1, m.composite)),
        userIntent: meta.row.source === "user_intent",
        startsAt: meta.row.starts_at ?? undefined,
        pillarTags: Array.isArray(pl.pillar_tags) ? (pl.pillar_tags as string[]) : [],
        reason: meta.radar.reasonSurfaced ?? undefined,
      };
    });
    const decisions = await runExecutiveCouncil({ shortlist }).catch(() => []);
    for (const d of decisions) execMeta.set(d.id, d);

    const kept: LivingFiveMember[] = [];
    for (const m of candidateMembers) {
      const d = execMeta.get(m.id);
      if (d && (d.surface === "archive" || d.surface === "hold")) {
        gateRejectedIds.push(m.id);
        reasons.push(`${candidateMeta.get(m.id)?.row.title ?? m.id}: executive → ${d.surface}${d.why_now ? ` (${d.why_now})` : ""}.`);
        continue;
      }
      const rank = d?.attentionRank ?? 99;
      const boost = Math.max(0, 0.08 - (rank - 1) * 0.01) + (d?.intentBoosted ? 0.12 : 0);
      const boosted = Math.min(1, m.composite + boost);
      m.composite = boosted;
      const meta = candidateMeta.get(m.id);
      if (meta) meta.composite = boosted;
      kept.push(m);
    }
    candidateMembers.length = 0;
    candidateMembers.push(...kept);
  }

  // ── Plan the living-5: fill open slots, displace weaker sitters ───────────────
  const plan = planLivingFive({
    active: activeMembers,
    candidates: candidateMembers,
    perCategory: RADAR_LIVING_FIVE_PER_CATEGORY,
    maxChanges: changeBudget,
  });

  let promoted = 0;
  const selectedIds: string[] = [];
  const promote = async (id: string, viaDisplacement: boolean): Promise<boolean> => {
    const meta = candidateMeta.get(id);
    if (!meta) return false;
    const now = new Date().toISOString();
    const basePayload = mergeRadarIntelligencePayload(
      meta.row.payload ?? meta.radar.item.rawPayload,
      meta.radar,
    );
    const exec = execMeta.get(id);
    const payload = {
      ...(basePayload as Record<string, unknown>),
      shown_at: now,
      ...(exec
        ? { exec: { attention_rank: exec.attentionRank, surface: exec.surface, why_now: exec.why_now, intent_boosted: exec.intentBoosted } }
        : {}),
    };
    const { error } = await input.supabase
      .from("surfaced_items")
      .update({
        destination: "radar",
        status: "shown",
        score: meta.composite,
        payload,
        updated_at: now,
      })
      .eq("id", id)
      .eq("user_id", input.userId);
    if (error) {
      reasons.push(`${meta.row.title}: promotion write failed (${error.message}).`);
      return false;
    }
    await markSourceProducedForPromotion({
      row: meta.row,
      item: rowToIndexedItem(meta.row),
      supabase: input.supabase,
      userId: input.userId,
      producedAt: new Date().toISOString(),
    });
    promoted++;
    selectedIds.push(id);
    reasons.push(`${meta.row.title}: promoted to ${meta.radar.category} (${meta.composite.toFixed(2)})${viaDisplacement ? " via displacement" : ""}.`);
    return true;
  };

  for (const p of plan.promotions) {
    await promote(p.id, false);
  }

  for (const d of plan.displacements) {
    const demoteMeta = activeMeta.get(d.demote);
    // Protect items the owner has engaged with — never displace an opened item.
    if (demoteMeta?.status === "opened") {
      reasons.push(`Kept ${demoteMeta.row.title ?? d.demote}: engaged by owner, not displaced.`);
      continue;
    }
    const { error: demoteError } = await input.supabase
      .from("surfaced_items")
      .update({ destination: "holding", status: "discovered", updated_at: new Date().toISOString() })
      .eq("id", d.demote)
      .eq("user_id", input.userId);
    if (demoteError) {
      reasons.push(`Displacement demote failed (${demoteError.message}); leaving sitter in place.`);
      continue;
    }
    await promote(d.promote, true);
  }

  if (plan.gaps.length > 0) {
    reasons.push(
      `Category gaps (Scout priority next run): ${plan.gaps.map((g) => `${g.category} ${g.have}/${g.need}`).join(", ")}.`,
    );
  }

  const rejectedIds = [
    ...gateRejectedIds,
    ...candidateMembers.map((m) => m.id).filter((id) => !selectedIds.includes(id)),
  ];
  await logPromotionDecisionRun({
    userId: input.userId,
    runId: input.runId,
    candidateIds,
    selectedIds,
    rejectedIds,
    reasons,
    slots: changeBudget,
    gaps: plan.gaps,
    occupancy: plan.occupancy,
    supabase: input.supabase,
  });
  return {
    reviewed: reviewedRows.length,
    promoted,
    reasons,
  };
}

function isActiveRadarInventoryItem(item: ReturnType<typeof rowToIndexedItem>): boolean {
  const category = normalizeRadarCategory(item.category ?? item.type);
  if (category === "finds") {
    const dossier = readFindsDossier(item.rawPayload);
    if (!dossier || !findIsReady(dossier)) return false;
    const userRequested = String(item.source) === "user_intent";
    return userRequested || readFindBudgetTier(dossier) !== "hold";
  }
  return evaluateActiveRadarItem(item).allowed;
}

function readFindsDossier(payload: unknown): ProductDossier | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const finds = (payload as Record<string, unknown>).finds;
  return finds && typeof finds === "object" && !Array.isArray(finds)
    ? (finds as ProductDossier)
    : null;
}

function readFindBudgetTier(dossier: ProductDossier): BudgetTier {
  const tier = dossier.budget_tier;
  if (tier === "attainable" || tier === "premium-realistic" || tier === "aspirational" || tier === "hold") return tier;
  return assessFindBudget(dossier).budget_tier;
}

async function markSourceProducedForPromotion(input: {
  row: SurfacedItemRow;
  item: ReturnType<typeof rowToIndexedItem>;
  supabase: SupabaseClient;
  userId: string;
  producedAt: string;
}): Promise<void> {
  const update = {
    last_produced_at: input.producedAt,
    updated_at: input.producedAt,
  };
  if (input.row.source_id) {
    const { error } = await input.supabase
      .from("intelligence_sources")
      .update(update)
      .eq("id", input.row.source_id)
      .eq("user_id", input.userId);
    if (error) {
      console.warn("[radarAutopilot] source production marker by id failed", error.message);
    }
    return;
  }
  const sourceKey = sourceKeyForItem(input.item);
  if (!sourceKey) return;
  const { error } = await input.supabase
    .from("intelligence_sources")
    .update(update)
    .eq("user_id", input.userId)
    .eq("source_key", sourceKey);
  if (error) {
    console.warn("[radarAutopilot] source production marker by key failed", error.message);
  }
}

/** Blends an enriched Radar item's sub-scores + live-location proximity into the
 *  taste-dominant composite score (Prompt 2, Task 3a). */
function compositeFor(
  radar: ReturnType<typeof enrichRadarItem>,
  item: ReturnType<typeof rowToIndexedItem>,
  userLat: number | null,
  userLng: number | null,
): number {
  const s = radar.scoreBreakdown;
  const miles =
    item.lat != null && item.lng != null && userLat != null && userLng != null
      ? haversineMiles(userLat, userLng, item.lat, item.lng)
      : null;
  return blendRadarComposite(
    deriveCompositeDimensions({
      tasteFit: s.tasteFit,
      timingFit: s.timingFit,
      energyCost: s.energyCost,
      moneyCost: s.moneyCost,
      northAlignment: s.northAlignment.score,
      longTermValue: s.longTermValue,
      milesFromUser: miles,
    }),
  );
}

/** A candidate is not "timely/valid" for displacement if it has already expired
 *  or its event start is in the past. */
function isStaleForRadar(item: ReturnType<typeof rowToIndexedItem>): boolean {
  const now = Date.now();
  if (item.expiresAt) {
    const expires = new Date(item.expiresAt).getTime();
    if (Number.isFinite(expires) && expires <= now) return true;
  }
  if (item.startsAt) {
    const starts = new Date(item.startsAt).getTime();
    if (Number.isFinite(starts) && starts < now - 2 * 60 * 60 * 1000) return true;
  }
  return false;
}

async function runBootstrapProviderGather(input: {
  userId: string;
  context: FounderContextPacket;
  supabase: SupabaseClient;
  maxCandidates: number;
  maxSources?: number;
  budget: RunBudget;
  spendBudget: AutopilotSpendBudget;
  providerStatus: SourceHealth;
}): Promise<{ candidates: number; sources: number; errors: string[]; timeBudgetReached: boolean }> {
  const errors: string[] = [];
  const providerCallCost = estimatePaidProviderCallCost(input.providerStatus);
  if (providerCallCost > 0 && !reservePaidProviderCalls(input.spendBudget, providerCallCost, "bootstrap_provider_gather")) {
    return {
      candidates: 0,
      sources: 0,
      errors: [`Bootstrap provider gather skipped because paid provider budget is exhausted (${budgetSnapshot(input.spendBudget).paidProviderCallsRemainingToday} daily calls remaining).`],
      timeBudgetReached: false,
    };
  }
  const lat = typeof input.context.location.homeLat === "number"
    ? input.context.location.homeLat
    : 41.6986;
  const lng = typeof input.context.location.homeLng === "number"
    ? input.context.location.homeLng
    : -88.0684;
  if (typeof input.context.location.homeLat !== "number" || typeof input.context.location.homeLng !== "number") {
    errors.push("Home coordinates missing in context; using Bolingbrook fallback for provider gather.");
    console.warn("[radar.autopilot] Home coordinates missing in context; using Bolingbrook fallback for provider gather.");
  }
  let candidates = 0;
  let sources = 0;
  let timeBudgetReached = false;
  try {
    const lanes = await gatherRadarCandidates({
      userId: input.userId,
      homeLat: lat,
      homeLng: lng,
      city: input.context.location.homeCity ?? undefined,
      state: input.context.location.homeState ?? undefined,
    });
    for (const lane of lanes) {
      if (input.budget.shouldStopSoon()) {
        timeBudgetReached = true;
        errors.push("Time budget reached during provider gather. Partial provider progress saved.");
        break;
      }
      for (const candidate of lane.candidates.slice(0, input.maxCandidates)) {
        if (input.budget.shouldStopSoon()) {
          timeBudgetReached = true;
          errors.push("Time budget reached during candidate intake. Partial provider progress saved.");
          break;
        }
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
        if (status === "created") candidates++;
        if (input.maxSources && sources >= input.maxSources) break;
        if (candidates >= input.maxCandidates) break;
      }
      if (timeBudgetReached) break;
      if (input.maxSources && sources >= input.maxSources) break;
      if (candidates >= input.maxCandidates) break;
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { candidates, sources, errors, timeBudgetReached };
}

async function logPromotionDecisionRun(input: {
  userId: string;
  runId?: string | null;
  candidateIds: string[];
  selectedIds: string[];
  rejectedIds: string[];
  reasons: string[];
  slots: number;
  gaps?: Array<{ category: string; have: number; need: number }>;
  occupancy?: Record<string, number>;
  supabase: SupabaseClient;
}): Promise<void> {
  if (input.candidateIds.length === 0) return;
  const { error } = await input.supabase
    .from("brain_decision_runs")
    .insert({
      user_id: input.userId,
      run_type: "promotion_review",
      input_summary: `Promotion Review evaluated ${input.candidateIds.length} surfaced item(s) within a ${input.slots}-change living-5 budget.`,
      candidate_ids: input.candidateIds,
      selected_ids: input.selectedIds,
      rejected_ids: input.rejectedIds,
      model: "deterministic-radar-living-five",
      raw_output: {
        autopilot_run_id: input.runId ?? null,
        gate: "enrichRadarItem + isPromotableWhenUnderfilled + livingFive(composite)",
        change_budget: input.slots,
        promoted: input.selectedIds.length,
        occupancy: input.occupancy ?? null,
        gaps: input.gaps ?? [],
        reasons: input.reasons.slice(0, 40),
      } satisfies Json,
    });
  if (error) {
    console.warn("[radar.autopilot] promotion decision log failed", error.message);
  }
  const { error: legacyError } = await input.supabase
    .from("decision_runs")
    .insert({
      user_id: input.userId,
      ask_text: "Radar Promotion Review",
      intent: "promotion_review",
      plan_horizon: "autopilot",
      context: {
        autopilot_run_id: input.runId ?? null,
        slots: input.slots,
        gate: "enrichRadarItem + isPromotableWhenUnderfilled + livingFive(composite)",
      },
      candidates: input.candidateIds,
      filtered_out: input.rejectedIds,
      recommendation: input.selectedIds,
      reasoning: input.reasons.slice(0, 12).join("\n"),
    });
  if (legacyError) {
    console.warn("[radar.autopilot] legacy decision run log failed", legacyError.message);
  }
}

async function readAutopilotSpendBudget(input: {
  userId: string;
  supabase: SupabaseClient;
}): Promise<AutopilotSpendBudget> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const budget: AutopilotSpendBudget = {
    paidProviderCallsPerDay: envNumber(AUTOPILOT_PAID_PROVIDER_CALLS_PER_DAY_ENV, DEFAULT_AUTOPILOT_PAID_PROVIDER_CALLS_PER_DAY),
    claudeTokensPerDay: envNumber(AUTOPILOT_CLAUDE_TOKENS_PER_DAY_ENV, DEFAULT_AUTOPILOT_CLAUDE_TOKENS_PER_DAY),
    paidProviderCallsPerRun: envNumber(AUTOPILOT_PAID_PROVIDER_CALLS_PER_RUN_ENV, DEFAULT_AUTOPILOT_PAID_PROVIDER_CALLS_PER_RUN),
    claudeTokensPerRun: envNumber(AUTOPILOT_CLAUDE_TOKENS_PER_RUN_ENV, DEFAULT_AUTOPILOT_CLAUDE_TOKENS_PER_RUN),
    paidProviderCallsUsedToday: 0,
    claudeTokensUsedToday: 0,
    paidProviderCallsThisRun: 0,
    claudeTokensThisRun: 0,
    skipped: [],
  };
  const { data, error } = await input.supabase
    .from("radar_autopilot_activity")
    .select("metadata")
    .eq("user_id", input.userId)
    .gte("created_at", since.toISOString());
  if (error || !data) return budget;
  for (const row of data as Array<{ metadata: Json }>) {
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    budget.paidProviderCallsUsedToday += readNumber(metadata.paid_provider_calls) ?? 0;
    budget.claudeTokensUsedToday += readNumber(metadata.claude_tokens_estimate) ?? 0;
  }
  return budget;
}

function reservePaidProviderCalls(budget: AutopilotSpendBudget, calls: number, reason: string): boolean {
  if (calls <= 0) return true;
  const snapshot = budgetSnapshot(budget);
  if (calls > snapshot.paidProviderCallsRemainingToday || calls > snapshot.paidProviderCallsRemainingThisRun) {
    budget.skipped.push(`${reason}: paid provider budget exhausted`);
    return false;
  }
  budget.paidProviderCallsThisRun += calls;
  return true;
}

function reserveClaudeTokens(budget: AutopilotSpendBudget, tokens: number, reason: string): boolean {
  if (tokens <= 0) return true;
  const snapshot = budgetSnapshot(budget);
  if (tokens > snapshot.claudeTokensRemainingToday || tokens > snapshot.claudeTokensRemainingThisRun) {
    budget.skipped.push(`${reason}: Claude token budget exhausted`);
    return false;
  }
  budget.claudeTokensThisRun += tokens;
  return true;
}

function budgetSnapshot(budget: AutopilotSpendBudget) {
  return {
    paidProviderCallsPerDay: budget.paidProviderCallsPerDay,
    claudeTokensPerDay: budget.claudeTokensPerDay,
    paidProviderCallsPerRun: budget.paidProviderCallsPerRun,
    claudeTokensPerRun: budget.claudeTokensPerRun,
    paidProviderCallsUsedToday: budget.paidProviderCallsUsedToday,
    claudeTokensUsedToday: budget.claudeTokensUsedToday,
    paidProviderCallsThisRun: budget.paidProviderCallsThisRun,
    claudeTokensThisRun: budget.claudeTokensThisRun,
    paidProviderCallsRemainingToday: Math.max(0, budget.paidProviderCallsPerDay - budget.paidProviderCallsUsedToday - budget.paidProviderCallsThisRun),
    claudeTokensRemainingToday: Math.max(0, budget.claudeTokensPerDay - budget.claudeTokensUsedToday - budget.claudeTokensThisRun),
    paidProviderCallsRemainingThisRun: Math.max(0, budget.paidProviderCallsPerRun - budget.paidProviderCallsThisRun),
    claudeTokensRemainingThisRun: Math.max(0, budget.claudeTokensPerRun - budget.claudeTokensThisRun),
    skipped: budget.skipped,
  };
}

function estimatePaidProviderCallCost(status: SourceHealth): number {
  return (["google-places", "ticketmaster", "tavily"] as const)
    .filter((provider) => status[provider] === "available")
    .length;
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
  target.eventsCreated = (target.eventsCreated ?? 0) + (partial.eventsCreated ?? 0);
  target.timeBudgetReached = Boolean(target.timeBudgetReached || partial.timeBudgetReached);
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
    (input.result.eventsCreated ?? 0) +
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
  const timed = input.result.timeBudgetReached
    ? " Time budget reached. Partial progress saved; continuing on the next scheduled run."
    : "";
  return `${label} ran ${input.stack.length} operation(s): ${input.stack.join(", ")}.${missionText} Discovered ${input.result.candidatesDiscovered}, created ${input.result.libraryItemsCreated} place/library item(s), created ${input.result.eventsCreated ?? 0} event(s), added ${input.result.sourcesCreated} source(s), checked ${input.result.sourcesChecked} source(s), promoted ${input.result.candidatesPromoted}.${partial}${timed}`;
}

function orderPromotionFirst(stack: RadarAutopilotOperation[]): RadarAutopilotOperation[] {
  if (!stack.includes("promotion_review")) return stack;
  return ["promotion_review", ...stack.filter((operation) => operation !== "promotion_review")];
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
    discoveredBacklog: health.discoveredBacklogCount,
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

function envNumber(name: string, fallback: number): number {
  const parsed = readNumber(process.env[name]);
  return parsed == null ? fallback : parsed;
}

function readNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWeekendWindow(now: Date): boolean {
  const day = now.getDay();
  return day === 4 || day === 5 || day === 6;
}
