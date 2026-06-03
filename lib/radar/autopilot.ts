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
import { selectSourcesDueForCheck, scoreSourceQuality } from "@/lib/library/sourceGraph";
import { planRadarCampaigns, type RadarCampaign } from "@/lib/radar/campaigns";
import {
  chooseRadarAutopilotOperation,
  type RadarAutopilotHealth,
  type RadarAutopilotMode,
  type RadarAutopilotOperation,
} from "@/lib/radar/autopilotPolicy";
import { syncCandidateInboxFromExistingPipelines } from "@/lib/radar/candidateInbox";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import {
  RADAR_ACTIVE_ITEM_LIMIT,
  RADAR_MIN_ACTIVE_ITEM_TARGET,
} from "@/lib/brain/constants";
import type { FounderContextPacket } from "@/lib/context/types";
import type { Json, SurfacedItemRow } from "@/lib/types/database";

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
  sourcesUpgraded: number;
  sourcesCooledDown: number;
  summary: string;
  campaign?: RadarCampaign;
  skipped?: boolean;
};

export async function runRadarAutopilot(input: {
  userId: string;
  mode?: RadarAutopilotMode;
  force?: boolean;
  supabase?: SupabaseClient;
}): Promise<RadarAutopilotResult> {
  const supabase = input.supabase ?? getSupabaseServiceClient();
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
    mode: input.mode,
  });
  const base = baseResult(operation, health, campaigns[0]);
  const result = await executeOperation({
    userId: input.userId,
    operation,
    base,
    campaigns,
    context,
    supabase,
    force: input.force || input.mode === "manual_force",
  });
  await safeWriteIntelligenceTrace(
    {
      userId: input.userId,
      route: "lib/radar/autopilot.runRadarAutopilot",
      surface: input.mode === "cron" ? "cron" : "radar",
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
  campaigns: RadarCampaign[];
  context: FounderContextPacket;
  supabase: SupabaseClient;
  force?: boolean;
}): Promise<RadarAutopilotResult> {
  const result = { ...input.base };
  try {
    switch (input.operation) {
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
        result.candidatesDiscovered += inbox.created + inbox.updated;
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
        const processed = await processCandidates(input.userId);
        const inbox = await syncCandidateInboxFromExistingPipelines({ userId: input.userId, supabase: input.supabase });
        result.candidatesDiscovered += scout.candidates_added + inbox.created + inbox.updated;
        result.libraryItemsCreated += processed.researched;
        result.candidatesRejected += processed.rejected;
        result.summary = `Library build ran Scout and processed ${processed.researched} place candidate(s).`;
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
    result.summary = `Autopilot operation ${input.operation} failed safely: ${error instanceof Error ? error.message : String(error)}`;
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
    sourcesUpgraded: 0,
    sourcesCooledDown: 0,
    summary: `Selected ${operation}.`,
    campaign,
  };
}

function isWeekendWindow(now: Date): boolean {
  const day = now.getDay();
  return day === 4 || day === 5 || day === 6;
}
