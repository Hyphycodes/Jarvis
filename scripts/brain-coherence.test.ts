import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeNorthAlignment,
  deriveDayContext,
  summarizeBehaviorPatterns,
  toBrainContextPacket,
  toChatContextPacket,
  type FounderContextPacket,
} from "../lib/context/types";
import { scoreIndexedItem } from "../lib/scoring/scoreIndexedItem";
import { buildItemIntentPayload, intentJson, readItemIntent } from "../lib/items/intents";
import { assessResultQuality } from "../lib/sources/resultQuality";
import { composeRadarMove, humanOperationLabel } from "../lib/radar/moveComposer";
import { shortlistRadarMoves } from "../lib/radar/moveShortlist";
import { buildCommandActionChips } from "../lib/chat/routeChatIntent";
import { buildIntelligenceReason, reasonForCircleMoment } from "../lib/brain/intelligenceReason";
import {
  buildContextTraceSummary,
  safeWriteIntelligenceTrace,
} from "../lib/brain/intelligenceTrace";
import { buildScoutMissions, isChicagoLike } from "../lib/brain/scoutMissions";
import {
  chooseRadarAutopilotOperation,
  type RadarAutopilotHealth,
} from "../lib/radar/autopilotPolicy";
import {
  assessBootstrapNeed,
  bootstrapProviderSummary,
  BOOTSTRAP_TARGETS,
  foundationOperationStack,
} from "../lib/radar/bootstrapPolicy";
import {
  isPausedForMode,
  normalizeAutopilotMode,
} from "../lib/radar/autopilotControlPolicy";
import {
  commitTasteSeedImport,
  dryRunTasteSeedImport,
} from "../lib/tasteSeed/importer";
import {
  parseTasteSeedMarkdown,
} from "../lib/tasteSeed/parser";
import {
  assessFoundationSprint,
  createRunBudget,
  DEFAULT_RUN_BUDGET_MS,
  FOUNDATION_BATCH_BUDGET,
  FOUNDATION_RUN_BUDGET_MS,
  FOUNDATION_SPRINT_TARGETS,
  foundationWorkDone,
  nextMissionCursor,
  selectFoundationMissions,
} from "../lib/radar/foundationSprint";
import { planRadarCampaigns } from "../lib/radar/campaigns";
import { qualityTierFromScore } from "../lib/library/quality";
import type { LibraryHealth } from "../lib/library/types";
import { sourceKeyFromUrl } from "../lib/library/sourceIdentity";
import { scoreSourceQuality } from "../lib/library/sourceScoring";
import type { ExplorationLane } from "../lib/brain/tasteStrategist";
import type { IndexedItem } from "../lib/index/types";
import type { RadarItem } from "../lib/intelligence/types";

const now = "2026-06-03T18:00:00.000Z";

function emptyPacket(): FounderContextPacket {
  return {
    userId: "user_test",
    now,
    timezone: "UTC",
    dayContext: deriveDayContext({ now: new Date(now), timezone: "UTC" }),
    location: {},
    weather: null,
    founder: {
      displayName: null,
      lifeDirection: null,
      currentFocus: null,
      vibeKeywords: [],
      avoidKeywords: [],
      dealbreakers: [],
      pinnedPrinciples: [],
      weeklyRhythm: null,
    },
    north: { pillars: [], activePriorities: [], tags: [] },
    radar: { current: [], recentlySaved: [], recentlyPassed: [], patterns: [] },
    today: { upcomingItems: [], activePlan: null, activePlans: [] },
    circle: { upcomingMoments: [], relevantPeople: [] },
    knownPlaces: [],
    memory: { stablePreferences: [], recentSignals: [] },
    behavior: {
      recentSignals: [],
      recentItemActions: [],
      savePatterns: [],
      passPatterns: [],
      planPatterns: [],
    },
  };
}

function item(overrides: Partial<IndexedItem> = {}): IndexedItem {
  return {
    id: "radar_test",
    source: "manual",
    type: "event",
    destination: "radar",
    title: "Land workshop dinner",
    category: "ownership",
    description: "A serious land and ownership workshop.",
    rawPayload: {},
    status: "shown",
    reasons: [],
    tags: ["land", "ownership", "workshop"],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function testEmptyContextDoesNotInventData() {
  const brain = toBrainContextPacket(emptyPacket());
  assert.equal(brain.homeCity, undefined);
  assert.equal(brain.activePlan, null);
  assert.deepEqual(brain.memory, []);
  assert.deepEqual(brain.recentActions, []);
  assert.deepEqual(brain.people, []);
}

function testBehaviorPatterns() {
  const patterns = summarizeBehaviorPatterns([
    { title: "Saved supper", category: "dining" },
    { title: "Saved steak", category: "dining" },
    { title: "Passed club", category: "nightlife" },
  ]);
  assert.equal(patterns[0].key, "dining");
  assert.equal(patterns[0].count, 2);
  assert.deepEqual(patterns[0].examples, ["Saved supper", "Saved steak"]);
}

function testNorthAlignmentInfluencesScore() {
  const aligned = computeNorthAlignment({
    itemTags: ["land", "workshop"],
    itemText: "ownership workshop",
    northTags: ["land ownership"],
  });
  assert.ok(aligned.score > 0);
  assert.ok(aligned.matchedPillars.length > 0);

  const withoutNorth = scoreIndexedItem(item()).total;
  const withNorth = scoreIndexedItem(item(), { northTags: ["land ownership"] }).total;
  assert.ok(withNorth > withoutNorth);
}

function testPassPatternsReduceScore() {
  const base = scoreIndexedItem(item()).total;
  const penalized = scoreIndexedItem(item(), {
    recentPassCategories: ["ownership"],
  }).total;
  const alreadyPassed = scoreIndexedItem(item({ status: "passed" })).total;
  assert.ok(penalized < base);
  assert.ok(alreadyPassed < penalized);
}

function testCircleAndPlansFlowIntoChatContext() {
  const packet = emptyPacket();
  packet.today.activePlans = [
    {
      id: "plan_1",
      title: "Dinner plan",
      status: "active",
      buildStatus: "ready",
      scheduledDate: "2026-06-06",
      scheduledTime: "19:00",
      summary: "A real active plan.",
      liveEnabled: true,
      updatedAt: now,
    },
  ];
  packet.today.activePlan = packet.today.activePlans[0];
  packet.circle.relevantPeople = [
    {
      id: "person_1",
      name: "Avery",
      category: "friend",
      role: "friend",
      closenessScore: 0.8,
      lastInteraction: now,
      nextAction: "Follow up",
      currentThread: "Dinner",
      notes: ["prefers quiet rooms"],
    },
  ];
  packet.circle.upcomingMoments = [
    {
      id: "moment_1",
      personId: "person_1",
      title: "Follow up",
      summary: "Ask about Saturday.",
      urgency: "medium",
      createdAt: now,
    },
  ];

  const brain = toBrainContextPacket(packet);
  const chat = toChatContextPacket(packet);
  assert.equal(brain.activePlan?.id, "plan_1");
  assert.equal(brain.people[0]?.recent_update?.title, "Follow up");
  assert.equal(chat.activePlans[0]?.title, "Dinner plan");
  assert.equal(chat.circle[0]?.name, "Avery");
}

function testVoiceCommandActionChips() {
  const sheetContext = "Current item id: item_123\nUser is on an item detail page.";
  const saveChip = buildCommandActionChips({ message: "save this", sheetContext })[0];
  assert.equal(saveChip?.action_type, "save_item");
  assert.equal(saveChip?.payload?.origin, "voice");
  assert.equal(
    buildCommandActionChips({ message: "pass on this", sheetContext })[0]?.action_type,
    "pass_item",
  );
  assert.equal(
    buildCommandActionChips({
      message: "remember I want quieter dinners",
      sheetContext,
    })[0]?.action_type,
    "remember",
  );
}

function testContextTraceSummarySurvivesEmptyContext() {
  const summary = buildContextTraceSummary(emptyPacket());
  assert.equal(summary.now, now);
  assert.deepEqual(summary.north, []);
  assert.deepEqual(summary.recentActions, []);
  assert.deepEqual(summary.people, []);
  assert.deepEqual(summary.memory, []);
}

function testIntelligenceReasonCarriesNorthAlignment() {
  const reason = buildIntelligenceReason({
    summary: "Worth surfacing because it advances North.",
    contextFactors: ["Current priority is land ownership."],
    northAlignment: {
      score: 0.82,
      matchedPillars: ["land ownership"],
      reason: "Matched North: land ownership",
    },
    confidence: 1.4,
  });
  assert.equal(reason.northAlignment?.score, 0.82);
  assert.deepEqual(reason.northAlignment?.matchedPillars, ["land ownership"]);
  assert.equal(reason.confidence, 1);
}

async function testSafeTraceDoesNotCrashMainFlow() {
  const originalError = console.error;
  console.error = () => {};
  let wrote = true;
  try {
    wrote = await safeWriteIntelligenceTrace(
      {
        userId: "user_test",
        route: "test",
        surface: "radar",
        decisionType: "test_failure",
      },
      async () => {
        throw new Error("synthetic write failure");
      },
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(wrote, false);
}

function lane(overrides: Partial<ExplorationLane> = {}): ExplorationLane {
  return {
    id: "lane_1",
    title: "Mission lane",
    interest_area: "ownership",
    mode: "aligned",
    subinterests: [],
    suggested_destination: "radar",
    why_it_fits: "Saved ownership signals.",
    why_now: "Useful this week.",
    urgency: "medium",
    effort_level: "medium",
    spending_posture: "free",
    source_strategy: ["specialist newsletters"],
    query_ideas: ["{city} land ownership workshops {year}"],
    preferred_domains: ["timeout.com"],
    excluded_domains: [],
    confidence: 0.72,
    ...overrides,
  };
}

function testScoutPrefersStrategistMissions() {
  const missions = buildScoutMissions({
    lanes: [lane()],
    city: "Austin",
    year: 2026,
    staticSeeds: [{ q: "{city} static seed", domains: ["example.com"] }],
    allowStaticFallback: true,
    minMissionCount: 1,
  });
  assert.equal(missions.length, 1);
  assert.equal(missions[0]?.seed, undefined);
  assert.equal(missions[0]?.queryIdeas[0], "Austin land ownership workshops 2026");
}

function testChicagoSeedsAreGated() {
  assert.equal(isChicagoLike("Chicago, IL"), true);
  assert.equal(isChicagoLike("Austin, TX"), false);

  const austinMissions = buildScoutMissions({
    lanes: [],
    city: "Austin",
    year: 2026,
    staticSeeds: [{ q: "best Chicago openings {year}", domains: ["timeout.com"], chicagoOnly: true }],
    allowStaticFallback: true,
    minMissionCount: 1,
  });
  assert.deepEqual(austinMissions, []);

  const chicagoMissions = buildScoutMissions({
    lanes: [],
    city: "Chicago",
    year: 2026,
    staticSeeds: [{ q: "best Chicago openings {year}", domains: ["timeout.com"], chicagoOnly: true }],
    allowStaticFallback: true,
    minMissionCount: 1,
  });
  assert.equal(chicagoMissions[0]?.seed, true);
  assert.deepEqual(chicagoMissions[0]?.domains, ["timeout.com"]);
}

function testEmptyMissionsDoNotCreateFakeDiscovery() {
  const missions = buildScoutMissions({
    lanes: [lane({ query_ideas: [] })],
    city: null,
    staticSeeds: [{ q: "{city} fallback", domains: ["example.com"] }],
    allowStaticFallback: true,
    minMissionCount: 1,
  });
  assert.deepEqual(missions, []);
}

function testCircleMomentReason() {
  const reason = reasonForCircleMoment({
    title: "Avery birthday",
    suggestedAction: "Send a note",
    urgency: "high",
  });
  assert.match(reason.summary, /Avery birthday/);
  assert.deepEqual(reason.circleInfluence, ["Send a note"]);
}

function testRadarRejectionHasStructuredReason() {
  const reason = buildIntelligenceReason({
    summary: "Rejected because similar items were passed recently.",
    contextFactors: ["Candidate was below confidence floor."],
    behaviorInfluence: ["Passed similar item recently"],
    sourceStrength: "weak",
    confidence: 0.28,
  });
  assert.match(reason.summary, /Rejected/);
  assert.deepEqual(reason.behaviorInfluence, ["Passed similar item recently"]);
  assert.equal(reason.sourceStrength, "weak");
}

function healthyLibrary(overrides: Partial<LibraryHealth> = {}): LibraryHealth {
  return {
    places: BOOTSTRAP_TARGETS.places,
    events: BOOTSTRAP_TARGETS.activeEvents,
    sources: BOOTSTRAP_TARGETS.sources,
    organizations: 4,
    people: 24,
    recurringSignals: 4,
    pendingCandidates: BOOTSTRAP_TARGETS.candidateInbox,
    rejectedMuted: 20,
    needsRefresh: 0,
    tierA: 16,
    tierB: 28,
    tierC: 40,
    depthScore: 0.82,
    ...overrides,
  };
}

function autopilotHealth(overrides: Partial<RadarAutopilotHealth> = {}): RadarAutopilotHealth {
  return {
    activeCount: 7,
    holdingCount: 24,
    discoveredBacklogCount: 0,
    candidateInboxCount: BOOTSTRAP_TARGETS.candidateInbox,
    sourceCount: BOOTSTRAP_TARGETS.sources,
    sourcesDue: 0,
    library: healthyLibrary(),
    eventFreshnessDays: 1,
    weekendReady: false,
    afterWorkReady: false,
    circleReady: false,
    northReady: true,
    ...overrides,
  };
}

function testAutopilotOperationSelection() {
  assert.equal(
    chooseRadarAutopilotOperation({ health: autopilotHealth(), campaigns: [] }),
    "no_op",
  );
  assert.equal(
    chooseRadarAutopilotOperation({ health: autopilotHealth({ activeCount: 3 }), campaigns: [] }),
    "front_room_refill",
  );
  assert.equal(
    chooseRadarAutopilotOperation({ health: autopilotHealth({ holdingCount: 4 }), campaigns: [] }),
    "holding_build",
  );
  assert.equal(
    chooseRadarAutopilotOperation({
      health: autopilotHealth({ candidateInboxCount: 8 }),
      campaigns: [],
    }),
    "foundation_build_mode",
  );
  assert.equal(
    chooseRadarAutopilotOperation({
      health: autopilotHealth({ library: healthyLibrary({ places: 4, depthScore: 0.1 }) }),
      campaigns: [],
    }),
    "foundation_build_mode",
  );
  assert.equal(
    chooseRadarAutopilotOperation({ health: autopilotHealth({ sourceCount: 2 }), campaigns: [] }),
    "foundation_build_mode",
  );
}

function testBootstrapPolicy() {
  const empty = autopilotHealth({
    activeCount: 7,
    holdingCount: 24,
    candidateInboxCount: 0,
    sourceCount: 0,
    library: healthyLibrary({
      places: 0,
      events: 0,
      sources: 0,
      pendingCandidates: 0,
      tierA: 0,
      tierB: 0,
      depthScore: 0,
    }),
  });
  const assessment = assessBootstrapNeed(empty);
  assert.equal(assessment.needed, true);
  assert.ok(assessment.gaps.includes("places"));
  assert.ok(assessment.gaps.includes("sources"));
  assert.equal(
    chooseRadarAutopilotOperation({ health: empty, campaigns: [], mode: "owner_requested" }),
    "foundation_build_mode",
  );
  assert.equal(
    chooseRadarAutopilotOperation({ health: autopilotHealth(), campaigns: [], mode: "owner_requested" }),
    "no_op",
  );
}

function testAutopilotModeAndPausePolicy() {
  assert.equal(normalizeAutopilotMode("cron"), "scheduled");
  assert.equal(normalizeAutopilotMode("scheduled"), "scheduled");
  assert.equal(normalizeAutopilotMode("bootstrap"), "bootstrap");
  assert.equal(normalizeAutopilotMode("foundation_sprint"), "foundation_sprint");
  assert.equal(isPausedForMode({ mode: "scheduled", enabled: false }), true);
  assert.equal(isPausedForMode({ mode: "bootstrap", enabled: false }), false);
  assert.equal(isPausedForMode({ mode: "foundation_sprint", enabled: false }), false);
  assert.equal(isPausedForMode({ mode: "owner_requested", enabled: false }), false);
  assert.equal(isPausedForMode({ mode: "scheduled", enabled: false, force: true }), false);
}

function testFoundationSprintPolicy() {
  const thin = autopilotHealth({
    candidateInboxCount: 10,
    sourceCount: 5,
    library: healthyLibrary({
      places: 20,
      events: 2,
      tierA: 1,
      tierB: 1,
      depthScore: 0.1,
    }),
  });
  assert.equal(assessFoundationSprint(thin).active, true);
  const missions = selectFoundationMissions({
    health: thin,
    providerStatus: {
      tavily: "available",
      "google-places": "available",
      ticketmaster: "available",
      brave: "not_configured",
      serpapi: "not_configured",
    },
    cursor: 0,
  });
  assert.ok(missions.length > 0);
  assert.equal(missions[0]?.type, "holding_promotion_review");
  assert.ok(missions.some((mission) => mission.type === "library_conversion"));
  assert.equal(
    selectFoundationMissions({
      health: autopilotHealth({
        candidateInboxCount: FOUNDATION_SPRINT_TARGETS.candidateInbox,
        sourceCount: FOUNDATION_SPRINT_TARGETS.sources,
        library: healthyLibrary({
          places: FOUNDATION_SPRINT_TARGETS.places,
          events: FOUNDATION_SPRINT_TARGETS.activeEvents,
          tierA: FOUNDATION_SPRINT_TARGETS.tierAPlusB,
          tierB: 0,
          people: FOUNDATION_SPRINT_TARGETS.tastemakers,
          organizations: FOUNDATION_SPRINT_TARGETS.organizations,
          recurringSignals: FOUNDATION_SPRINT_TARGETS.recurringSignals,
          pendingCandidates: FOUNDATION_SPRINT_TARGETS.candidateInbox,
          depthScore: 1,
        }),
      }),
      providerStatus: {
        tavily: "available",
        "google-places": "available",
        ticketmaster: "available",
        brave: "not_configured",
        serpapi: "not_configured",
      },
    }).length,
    0,
  );
  assert.equal(foundationWorkDone({
    candidates: 3,
    sources: 0,
    library: 0,
    events: 0,
    held: 0,
    promoted: 0,
    checked: 0,
  }), true);
}

function testFoundationSprintTimeoutBudget() {
  assert.ok(DEFAULT_RUN_BUDGET_MS < 60_000);
  assert.ok(FOUNDATION_RUN_BUDGET_MS < 60_000);
  assert.ok(FOUNDATION_BATCH_BUDGET.maxOperations <= 3);
  assert.ok(FOUNDATION_BATCH_BUDGET.maxCandidatesCreated <= 50);
  assert.ok(FOUNDATION_BATCH_BUDGET.maxSourcesCreated <= 20);
  assert.ok(FOUNDATION_BATCH_BUDGET.maxLibraryItemsCreated <= 20);

  let nowMs = 1_000;
  const budget = createRunBudget(10_000, () => nowMs);
  assert.equal(budget.timeRemainingMs(), 10_000);
  assert.equal(budget.shouldStopSoon(), false);
  nowMs = 6_100;
  assert.equal(budget.shouldStopSoon(), true);
  assert.equal(nextMissionCursor(3, 1), 4);
}

function testFoundationOperationStackIsBoundedAndConservative() {
  const stack = foundationOperationStack({
    health: autopilotHealth({
      holdingCount: 0,
      candidateInboxCount: 0,
      sourceCount: 0,
      library: healthyLibrary({
        places: 0,
        events: 0,
        sources: 0,
        pendingCandidates: 0,
        tierA: 0,
        tierB: 0,
        depthScore: 0,
      }),
    }),
  });
  assert.ok(stack.length > 1);
  assert.ok(stack.includes("source_building_campaign"));
  assert.ok(stack.includes("library_build"));
  assert.ok(stack.includes("candidate_inbox_build"));
  assert.ok(stack.includes("promotion_review"));
  assert.equal(stack.includes("front_room_refill"), false);
}

function testProviderMissingSummaryAndSourceIdentity() {
  assert.equal(sourceKeyFromUrl("https://www.example.com/events/a"), "example.com");
  assert.match(
    bootstrapProviderSummary({
      tavily: "not_configured",
      brave: "not_configured",
      serpapi: "not_configured",
    }) ?? "",
    /No external discovery providers/,
  );
  assert.match(
    bootstrapProviderSummary({
      tavily: "available",
      brave: "not_configured",
    }) ?? "",
    /Bootstrap will use tavily/,
  );
}

function testSourceGraphScoringAndCadence() {
  const strong = scoreSourceQuality({
    total_candidates: 12,
    total_saved: 5,
    total_planned: 3,
    total_passed: 1,
    total_library_items: 4,
    trust_score: 0.75,
    taste_fit_score: 0.75,
    novelty_score: 0.7,
    freshness_score: 0.7,
  });
  assert.equal(strong.status, "watching");
  assert.ok(strong.cadenceHours <= 24);

  const weak = scoreSourceQuality({
    total_candidates: 20,
    total_saved: 1,
    total_planned: 0,
    total_passed: 12,
    duplicate_rate: 0.45,
    trust_score: 0.35,
    taste_fit_score: 0.25,
  });
  assert.equal(weak.status, "cooldown");
  assert.ok(weak.cadenceHours >= 168);
}

function testCampaignPlannerUsesContext() {
  const packet = emptyPacket();
  packet.location.homeCity = "Austin";
  packet.north.activePriorities = [
    {
      id: "north_1",
      title: "Land ownership",
      pillarId: "pillar_1",
      summary: "Build the ownership lane.",
      source: "test",
    },
  ];
  const campaigns = planRadarCampaigns({
    context: packet,
    health: {
      activeCount: 7,
      holdingCount: 20,
      candidateInboxCount: 40,
      sourceCount: 2,
      library: healthyLibrary({ places: 4, depthScore: 0.2 }),
    },
    now: new Date(now),
  });
  assert.equal(campaigns[0]?.kind, "source_building");
  assert.ok(campaigns.some((campaign) => campaign.queryIdeas.join(" ").includes("Land ownership")));
  assert.ok(campaigns.every((campaign) => !/Chicago|Schaumburg/.test(campaign.queryIdeas.join(" "))));
}

function testCandidateAndLibraryBoundaries() {
  assert.equal(qualityTierFromScore(0.8), "A");
  assert.equal(qualityTierFromScore(0.62), "B");
  assert.equal(qualityTierFromScore(0.4), "C");
  assert.equal(
    chooseRadarAutopilotOperation({
      health: autopilotHealth({
        activeCount: 7,
        holdingCount: 24,
        candidateInboxCount: BOOTSTRAP_TARGETS.candidateInbox,
        library: healthyLibrary({ depthScore: 0.9 }),
        sourceCount: BOOTSTRAP_TARGETS.sources,
      }),
      campaigns: [],
    }),
    "no_op",
  );
}

function testAutopilotCronWiring() {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
    functions?: Record<string, { maxDuration?: number }>;
  };
  assert.ok(vercel.crons?.some((cron) =>
    cron.path === "/api/radar/autopilot" && cron.schedule === "0 */2 * * *"
  ));
  assert.ok(vercel.crons?.some((cron) =>
    cron.path === "/api/radar/autopilot?mode=foundation_sprint" &&
    cron.schedule === "*/15 * * * *"
  ));
  assert.equal(vercel.functions?.["app/api/radar/autopilot/route.ts"]?.maxDuration, 300);
  const route = readFileSync("app/api/radar/autopilot/route.ts", "utf8");
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /foundation_sprint/);
  assert.match(route, /maxDuration = 300/);
  assert.match(route, /requireOwner/);
  assert.match(route, /toAutopilotResponse/);
}

function testCronMiddlewareBypass() {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  const middleware = readFileSync("middleware.ts", "utf8");
  const cronPathnames = new Set(
    (vercel.crons ?? []).map((cron) => new URL(cron.path ?? "/", "https://jarvis.local").pathname),
  );
  for (const pathname of cronPathnames) {
    assert.match(
      middleware,
      new RegExp(pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${pathname} should bypass login middleware and rely on route-level cron auth`,
    );
  }
  assert.match(middleware, /isCronApiPath\(request\.nextUrl\.pathname\)/);
  assert.match(middleware, /NextResponse\.next\(\)/);
  assert.ok(
    middleware.indexOf("isCronApiPath(request.nextUrl.pathname)") <
      middleware.indexOf("updateSupabaseSession(request)"),
  );
}

function testAutopilotRunStateMigrationAndControls() {
  const migration = readFileSync(
    "supabase/migrations/0013_radar_autopilot_control_room.sql",
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.radar_autopilot_runs/);
  assert.match(migration, /create table if not exists public\.radar_autopilot_activity/);
  assert.match(migration, /create table if not exists public\.radar_autopilot_settings/);

  const autopilot = readFileSync("lib/radar/autopilot.ts", "utf8");
  assert.match(autopilot, /createAutopilotRun/);
  assert.match(autopilot, /finishAutopilotRun/);
  assert.match(autopilot, /shouldStopAutopilot/);
  assert.match(autopilot, /foundation_build_mode/);

  const page = readFileSync("app/settings/library/page.tsx", "utf8");
  assert.match(page, /ControlRoomActions/);
  assert.match(page, /Discovery is blocked/);
  assert.match(page, /Activity/);

  const actions = readFileSync("app/settings/library/ControlRoomActions.tsx", "utf8");
  assert.match(actions, /Bootstrap/);
  assert.match(actions, /Start Sprint/);
  assert.match(actions, /Next Mission/);
  assert.match(actions, /Commit Import/);
  assert.match(actions, /Pause/);
  assert.match(actions, /Resume/);
  assert.match(actions, /Stop After Current Step/);

  const foundationMigration = readFileSync(
    "supabase/migrations/0014_foundation_sprint_mode.sql",
    "utf8",
  );
  assert.match(foundationMigration, /foundation_sprint_enabled/);
  assert.match(foundationMigration, /partial_success/);
  assert.match(foundationMigration, /foundation_sprint/);
}

const tasteSeedFixture = `
## PEOPLE / CIRCLE

### Kamila
- Best friend since age 4
- Spelled with a K — Kamila
- Active together: basketball, soccer, gym, pickleball

### Sophia Ramos
- Close friend, lives in Logan Square, Chicago
- Sophia spelled with ph, not f

### Kamila’s extended family
- **Andres** — Kamila’s older brother
- **Vu** — pickleball crew. Treat as family.

## UPCOMING EVENTS

### White Sox Tailgate + Game — ~June 11
- Kamila’s birthday is June 12
- Going with Kamila’s family: Andres, cousins, extended crew

### Kamila birthday — June 12

## PLACES

### Eight Bar — Gold Coast, Chicago
- Similar vibe to M&A but more accessible price point
- **Why liked:** quality food, elevated feel without being pretentious, great service moment
- **Use case:** date night, nice dinner
- **Would return:** yes

### Nobu — Chicago
- **Why liked:** design, service, crowd, elevated feeling
- **What not to misunderstand:** doesn’t mean Jerry wants clubby luxury restaurants regularly
- **Would return:** occasionally / drink only for now

## TASTE SIGNALS

### Food
- Animal-based diet — ribeye, steak, carnitas
- Indian food: not really his thing

### Negative Filters (what to avoid suggesting)
- Too clubby
- Too flashy / try-hard
- Corny or generic

## DISCOVERY SOURCES TO MONITOR

- **Chicago Bucket List** — Instagram + blog. Jerry has acted on recommendations from here.
- Walk-and-discover — proximity and neighborhood drift
`;

function testTasteSeedParserExtractsOwnerContext() {
  const parsed = parseTasteSeedMarkdown(tasteSeedFixture);
  assert.ok(parsed.people.some((person) => person.name === "Kamila"));
  assert.ok(parsed.people.some((person) => person.name === "Sophia Ramos"));
  assert.ok(parsed.people.some((person) => person.name === "Andres"));
  assert.ok(parsed.places.some((place) => place.name === "Eight Bar" && place.useCases.includes("date night, nice dinner")));
  assert.ok(parsed.places.some((place) => place.name === "Nobu" && place.guardrails.some((note) => /clubby luxury/i.test(note))));
  assert.ok(parsed.negativeFilters.some((filter) => filter.trait === "Too clubby"));
  assert.ok(parsed.negativeFilters.some((filter) => filter.trait === "try-hard"));
  assert.ok(parsed.discoverySources.some((source) => source.name === "Chicago Bucket List" && source.status === "watching"));
  assert.equal(parsed.upcomingEvents.find((event) => event.title === "White Sox Tailgate + Game")?.ambiguousDate, true);
}

function testTasteSeedDryRunAndBoundaries() {
  const result = dryRunTasteSeedImport({
    markdown: tasteSeedFixture,
    fileName: "JARVIS TASTE SEED.md",
    importedAt: now,
  });
  assert.equal(result.mode, "dry_run");
  assert.equal(result.summary.created.people, 0);
  assert.equal(result.summary.wouldCreate.activeRadar, 0);
  assert.equal(result.summary.wouldCreate.candidateInbox, 0);
  assert.ok(result.summary.wouldCreate.people >= 4);
  assert.ok(result.provenance.source_file_name === "JARVIS TASTE SEED.md");
  assert.equal(result.provenance.confidence, "owner_provided");
}

function testTasteSeedIdempotentKeys() {
  const first = parseTasteSeedMarkdown(tasteSeedFixture);
  const second = parseTasteSeedMarkdown(tasteSeedFixture);
  assert.deepEqual(first.people.map((person) => person.key), second.people.map((person) => person.key));
  assert.deepEqual(first.places.map((place) => place.key), second.places.map((place) => place.key));
  assert.deepEqual(first.tasteSignals.map((signal) => signal.key), second.tasteSignals.map((signal) => signal.key));
  assert.deepEqual(first.negativeFilters.map((signal) => signal.key), second.negativeFilters.map((signal) => signal.key));
}

function testNegativeTasteFiltersAffectScoring() {
  const base = scoreIndexedItem(item({
    title: "New rooftop dinner",
    description: "A polished dinner room.",
    tags: ["dining"],
  })).total;
  const penalized = scoreIndexedItem(item({
    title: "Clubby try-hard rooftop dinner",
    description: "Flashy tourist-facing scene.",
    tags: ["dining"],
  }), {
    avoidKeywords: ["clubby", "try-hard", "tourist-facing"],
  });
  assert.ok(penalized.total < base);
  assert.ok(penalized.reasons.some((reason) => /Taste filter penalty/i.test(reason)));
}

function testIntentStatesAffectRadarScoringAndResurfacing() {
  const base = scoreIndexedItem(item()).total;
  const laterPayload = buildItemIntentPayload({
    item: item({ title: "Private horseback riding near forest preserve", category: "activity" }),
    intent: "interested_later",
    now,
  });
  const later = scoreIndexedItem(item({
    title: "Private horseback riding near forest preserve",
    category: "activity",
    rawPayload: { intent: intentJson(laterPayload) },
  }));
  assert.ok(later.total < base);
  assert.ok(later.reasons.some((reason) => /owner intent/i.test(reason)));
  assert.ok(readItemIntent({ intent: intentJson(laterPayload) })?.watch_conditions?.timing?.includes("weekend"));

  const betterVersion = scoreIndexedItem(item({
    rawPayload: {
      intent: intentJson(buildItemIntentPayload({
        item: item({ title: "Generic jazz night list", category: "music" }),
        intent: "better_version",
        now,
      })),
    },
  }));
  assert.ok(betterVersion.total < later.total);
  assert.ok(betterVersion.reasons.some((reason) => /better version/i.test(reason)));
}

function testIntentActionRouteAndBehaviorWiring() {
  const route = readFileSync("app/api/items/[id]/[action]/route.ts", "utf8");
  assert.match(route, /interested-later/);
  assert.match(route, /better-version/);
  assert.match(route, /save-taste/);

  const actions = readFileSync("lib/actions/items.ts", "utf8");
  assert.match(actions, /markItemIntent/);
  assert.match(actions, /type: "item\.intent"/);
  assert.match(actions, /planningState: input\.intent/);
  assert.match(actions, /updateSourceStatsFromAction/);
  assert.match(actions, /sourceActionForIntent/);

  const memoryRules = readFileSync("lib/memory/memoryRules.ts", "utf8");
  assert.match(memoryRules, /item\.intent/);
  assert.match(memoryRules, /better_version/);
  assert.match(memoryRules, /interested_later/);

  const sourceGraph = readFileSync("lib/library/sourceGraph.ts", "utf8");
  assert.match(sourceGraph, /interested_later/);
  assert.match(sourceGraph, /better_version/);
  assert.match(sourceGraph, /intent_feedback/);
}

function testDiscoveryQualityRejectsGenericJunk() {
  const yelp = assessResultQuality({
    title: "Best 10 Restaurants Near Me",
    url: "https://www.yelp.com/search?find_desc=restaurants",
    snippet: "Yelp best 10 list.",
    category: "dining",
  });
  assert.equal(yelp.hardReject, true);
  assert.ok(yelp.flags.includes("generic_directory"));
  assert.ok(yelp.reasons.some((reason) => /generic directory/i.test(reason)));

  const mensWearhouse = assessResultQuality({
    title: "Men's Wearhouse Store Locator",
    url: "https://www.menswearhouse.com/store-locator",
    snippet: "Retail chain suits.",
    category: "culture",
  });
  assert.equal(mensWearhouse.hardReject, true);
  assert.ok(mensWearhouse.flags.includes("chain_retail_mismatch"));

  const trivago = assessResultQuality({
    title: "Chicago hotel deals",
    url: "https://www.trivago.com/en-US/lm/hotels-chicago",
    category: "events",
  });
  assert.equal(trivago.hardReject, true);
  assert.ok(trivago.flags.includes("hotel_aggregator_mismatch"));

  const genericEventbrite = assessResultQuality({
    title: "Chicago events this weekend",
    url: "https://www.eventbrite.com/d/il--chicago/events/",
    category: "events",
  });
  assert.equal(genericEventbrite.hardReject, true);
  assert.ok(genericEventbrite.flags.includes("generic_event_page"));

  const specificEventbrite = assessResultQuality({
    title: "Chef tasting night at a specific venue",
    url: "https://www.eventbrite.com/e/chef-tasting-night-tickets-123456789",
    category: "events",
  });
  assert.equal(specificEventbrite.hardReject, false);
  assert.ok(!specificEventbrite.flags.includes("generic_event_page"));
}

function testQualityFiltersReachCandidateConversionAndPreviews() {
  const conversion = readFileSync("lib/radar/candidateConversion.ts", "utf8");
  assert.match(conversion, /assessResultQuality/);
  assert.match(conversion, /Rejected by discovery quality filter/);
  assert.match(conversion, /quality_flags/);
  assert.match(conversion, /foundation_sprint_quality_filter/);

  const preview = readFileSync("app/settings/library/page.tsx", "utf8");
  assert.match(preview, /Later \/ Watch \/ Better Version/);
  assert.match(preview, /intentItems/);
  assert.match(preview, /Owner intent is stored/);
}

function testPromotionFollowThroughContract() {
  const autopilot = readFileSync("lib/radar/autopilot.ts", "utf8");
  assert.match(autopilot, /eligibleDiagnostics/);
  assert.match(autopilot, /RADAR_MIN_ACTIVE_ITEM_TARGET - input\.base\.activeCount/);
  assert.match(autopilot, /Promotion review found \$\{eligibleDiagnostics\.length\} eligible item\(s\) but promoted 0/);
  assert.match(autopilot, /No available Active Radar slots under target/);
  assert.match(autopilot, /reasons:/);

  const diagnostics = readFileSync("lib/radar/promotionDiagnostics.ts", "utf8");
  assert.match(diagnostics, /Raw Candidate Inbox rows never promote directly/);
  assert.match(diagnostics, /Owner requested a better version/);
  assert.match(diagnostics, /Muted by owner intent/);
}

function testTasteSeedRouteAndDocsWiring() {
  const route = readFileSync("app/api/library/import-taste-seed/route.ts", "utf8");
  assert.match(route, /dryRun/);
  assert.match(route, /commitTasteSeedImport/);
  assert.match(route, /requireOwner/);
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };
  assert.match(pkg.scripts?.["import:taste-seed"] ?? "", /scripts\/import-taste-seed\.ts/);
}

async function testTasteSeedCommitWritesCirclePeople() {
  const supabase = new MemorySupabase({
    circle_people: [],
    circle_updates: [],
    intelligence_sources: [],
    places_library: [],
    taste_signals: [],
    memory_items: [],
    founder_profile: [],
    intelligence_traces: [],
  });
  const first = await commitTasteSeedImport({
    userId: "user_test",
    markdown: tasteSeedFixture,
    fileName: "JARVIS TASTE SEED.md",
    importedAt: now,
    supabase: supabase as never,
  });
  assert.equal(first.summary.created.people, 4);
  assert.ok(supabase.rows("circle_people").some((row) => row.name === "Kamila"));
  assert.ok(supabase.rows("circle_people").some((row) => row.name === "Sophia Ramos"));
  assert.ok(supabase.rows("circle_people")
    .find((row) => row.name === "Kamila")?.notes?.some((note: string) => /Spelled with a K/.test(note)));
  const second = await commitTasteSeedImport({
    userId: "user_test",
    markdown: tasteSeedFixture,
    fileName: "JARVIS TASTE SEED.md",
    importedAt: now,
    supabase: supabase as never,
  });
  assert.equal(second.summary.created.people, 0);
  assert.equal(second.summary.updated.people, 4);
  assert.equal(supabase.rows("circle_people").filter((row) => row.name === "Kamila").length, 1);
}

function testCandidateInboxConversionContract() {
  const source = readFileSync("lib/radar/candidateConversion.ts", "utf8");
  assert.match(source, /from\("radar_candidate_inbox"\)/);
  assert.match(source, /from\("places_library"\)/);
  assert.match(source, /from\("current_events"\)/);
  assert.match(source, /status: "library"/);
  assert.match(source, /no fake event date was created/);
  assert.match(source, /budget\?: RunBudget/);
  assert.match(source, /shouldStopSoon\(\)/);
  assert.match(source, /Time budget reached during Candidate Inbox conversion/);
  assert.doesNotMatch(source, /from\("surfaced_items"\)\.insert/);
}

function testTimeoutSafeAutopilotContract() {
  const autopilot = readFileSync("lib/radar/autopilot.ts", "utf8");
  assert.match(autopilot, /createRunBudget/);
  assert.match(autopilot, /FOUNDATION_RUN_BUDGET_MS/);
  assert.match(autopilot, /timeBudgetReached && didUsefulWork/);
  assert.match(autopilot, /partial_success/);
  assert.match(autopilot, /Time budget reached\. Partial progress saved/);
  assert.match(autopilot, /maxOperations: FOUNDATION_BATCH_BUDGET\.maxOperations/);
  assert.match(autopilot, /maxCandidates: FOUNDATION_BATCH_BUDGET\.maxCandidatesCreated/);
  assert.match(autopilot, /limit: isSprint \? FOUNDATION_BATCH_BUDGET\.maxLibraryItemsCreated/);
  assert.match(autopilot, /Provider availability:/);
  assert.doesNotMatch(autopilot, /input\.base\.mode === "foundation_sprint"[\s\S]{0,240}processEventCandidates/);
}

function testLibraryPreviewAndPromotionDiagnosticsContract() {
  const previews = readFileSync("lib/library/previews.ts", "utf8");
  assert.match(previews, /from\("radar_candidate_inbox"\)/);
  assert.match(previews, /from\("intelligence_sources"\)/);
  assert.match(previews, /from\("places_library"\)/);
  assert.match(previews, /from\("current_events"\)/);
  assert.match(previews, /Rejected \/ Muted|rejectedMuted/);
  assert.match(previews, /rejection_reason/);
  assert.match(previews, /sourceLabel\(row\.raw_payload\)/);

  const diagnostics = readFileSync("lib/radar/promotionDiagnostics.ts", "utf8");
  assert.match(diagnostics, /sourceLayer: "candidate_inbox"/);
  assert.match(diagnostics, /Raw Candidate Inbox rows never promote directly/);
  assert.match(diagnostics, /Missing exact event date\/time/);
  assert.match(diagnostics, /nextStep: row\.status === "rejected"/);
  assert.match(diagnostics, /isPromotableWhenUnderfilled/);
  assert.match(diagnostics, /sourceLayer: "holding"/);
  assert.match(diagnostics, /places_library/);
  assert.match(diagnostics, /current_events/);
  assert.doesNotMatch(diagnostics, /from\("surfaced_items"\)\.insert/);
}

function testSettingsLibraryVisibilityWiring() {
  const page = readFileSync("app/settings/library/page.tsx", "utf8");
  assert.match(page, /readLibraryPreview/);
  assert.match(page, /readRadarPromotionDiagnostics/);
  assert.match(page, /Radar Promotion Diagnostics/);
  assert.match(page, /Pending Candidates/);
  assert.match(page, /Rejected \/ Muted/);
  assert.match(page, /DISPLAY_TIME_ZONE = "America\/Chicago"/);
  assert.match(page, /Last error detail/);
  assert.match(page, /safeErrorDetail/);

  const actions = readFileSync("app/settings/library/ControlRoomActions.tsx", "utf8");
  assert.match(actions, /Promotion Review/);
  assert.match(actions, /manual_force/);
}

function testPromotionReviewActivityContract() {
  const autopilot = readFileSync("lib/radar/autopilot.ts", "utf8");
  assert.match(autopilot, /readRadarPromotionDiagnostics/);
  assert.match(autopilot, /Promotion review considered/);
  assert.match(autopilot, /blockers: diagnostics\.items/);
  assert.match(autopilot, /Promotion review promoted 0 items/);
}

function radarItem(overrides: Partial<RadarItem> = {}): RadarItem {
  const baseItem = item({
    title: "Horseback riding experience",
    type: "place",
    category: "outdoors",
    description: "A scenic outdoor riding option outside the city.",
    tags: ["outdoor", "weekend", "small group"],
  });
  return {
    item: baseItem,
    title: "Horseback Riding Outside the City",
    category: "outdoors",
    vibe: "land_escape",
    reasonSurfaced: "Scenic weekend move. Better with one person or a small group.",
    strongestAngle: "Worth watching for a clear Saturday.",
    confidence: 0.78,
    score: 0.82,
    scoreBreakdown: {
      total: 0.82,
      tasteFit: 0.86,
      timingFit: 0.68,
      novelty: 0.72,
      usefulness: 0.8,
      vibeStrength: 0.78,
      planPotential: 0.74,
      evidenceQuality: 0.7,
      socialUpside: 0.66,
      creativeUpside: 0.2,
      longTermValue: 0.45,
      energyCost: 0.35,
      moneyCost: 0.45,
      redundancyPenalty: 0,
      northAlignment: { score: 0, matchedPillars: [], reason: "No North match." },
    },
    planReadiness: {
      shouldPreparePlan: true,
      confidence: 0.7,
      knownDetails: ["outdoor activity"],
      missingDetails: ["exact time"],
    },
    source: { domain: "example.com" },
    evidence: { quality: 0.7, summary: "Specific activity details available." },
    missingInfo: ["confirm timing"],
    suggestedAction: "Save for a weekend.",
    radarDisposition: "active",
    todayDisposition: "not_today",
    planDisposition: "seed",
    canGeneratePlan: true,
    diversityGroup: "active_social",
    decision: {
      admission: "radar",
      confidence: 0.78,
      purpose_label: "Outdoor reset",
      move_title: "Horseback Riding Outside the City",
      one_line: "Scenic weekend move.",
      best_move: "Watch for a clear Saturday.",
      display_depth: "compact",
      positive_signals: ["scenic", "small group"],
      negative_flags: [],
      council_scores: { scout: 0.8, operator: 0.72, taste: 0.86, growth: 0.6, critic: 0.7 },
      appliedConfidenceFloor: 0.72,
    },
    northAlignment: { score: 0, matchedPillars: [], reason: "No North match." },
    ...overrides,
  };
}

function testRadarMoveComposerCreatesHumanCopy() {
  const move = composeRadarMove(radarItem());
  assert.equal(move.sourceLayer, "holding");
  assert.equal(move.moveTitle, "Horseback Riding Outside the City");
  assert.match(move.moveSummary, /Scenic weekend move/);
  assert.doesNotMatch(`${move.moveTitle} ${move.moveSummary}`, /candidate inbox|source graph|holding|eligible|promote_candidate/i);
  assert.ok(move.bestFor?.includes("small group"));
  assert.ok(move.friction?.includes("confirm timing"));
}

function testMoveShortlistPicksBestSimilarLane() {
  const weak = radarItem({
    item: item({ id: "horse_weak", title: "Horseback riding basic listing", type: "place", category: "outdoors", tags: ["horse"] }),
    score: 0.62,
    scoreBreakdown: {
      ...radarItem().scoreBreakdown,
      total: 0.62,
      tasteFit: 0.55,
      timingFit: 0.5,
      evidenceQuality: 0.46,
    },
    evidence: { quality: 0.46 },
  });
  const strong = radarItem({
    item: item({ id: "horse_strong", title: "Private trail ride", type: "place", category: "outdoors", tags: ["horse", "trail"] }),
    score: 0.86,
  });
  const dinner = radarItem({
    item: item({ id: "dinner", title: "Quiet dinner room", type: "restaurant", category: "dining", tags: ["dining"] }),
    category: "dining",
    vibe: "social_controlled",
    score: 0.8,
  });
  const selected = shortlistRadarMoves([weak, strong, dinner], 3);
  assert.ok(selected.some((entry) => entry.item.id === "horse_strong"));
  assert.equal(selected.some((entry) => entry.item.id === "horse_weak"), false);
  assert.ok(selected.some((entry) => entry.item.id === "dinner"));
}

function testPromotionBridgeAndVisibleCountContracts() {
  const autopilot = readFileSync("lib/radar/autopilot.ts", "utf8");
  assert.match(autopilot, /evaluateActiveRadarItem\(item\)\.allowed/);
  assert.match(autopilot, /mergeRadarIntelligencePayload/);
  assert.match(autopilot, /shortlistRadarMoves/);
  assert.match(autopilot, /promotion write failed/);
  assert.match(autopilot, /moved to Radar as a composed move/);

  const curator = readFileSync("lib/intelligence/radarCurator.ts", "utf8");
  assert.match(curator, /composeRadarMove/);
  assert.match(curator, /radar_move/);
  assert.match(curator, /radar_disposition: item\.radarDisposition/);
  assert.match(curator, /shortlistRadarMoves/);

  const loader = readFileSync("lib/dispatch/loadSurface.ts", "utf8");
  assert.match(loader, /payload\.radar_move/);
  assert.match(loader, /stringValue\(move\.move_title\)/);
  assert.match(loader, /stringValue\(move\.why_this\)/);
}

function testHumanOperationLabels() {
  assert.equal(humanOperationLabel("promotion_review"), "Reviewing what is ready for Radar");
  assert.equal(humanOperationLabel("source_building_campaign"), "Testing sources");
  assert.equal(humanOperationLabel("foundation_build_mode"), "Building the intelligence bank");
}

type Row = Record<string, any>;

class MemorySupabase {
  private data: Record<string, Row[]>;
  private id = 0;

  constructor(seed: Record<string, Row[]>) {
    this.data = Object.fromEntries(Object.entries(seed).map(([key, rows]) => [key, rows.map((row) => ({ ...row }))]));
  }

  from(table: string) {
    if (!this.data[table]) this.data[table] = [];
    return new MemoryQuery(this, table);
  }

  rows(table: string): Row[] {
    return this.data[table] ?? [];
  }

  nextId(table: string): string {
    this.id++;
    return `${table}_${this.id}`;
  }
}

class MemoryQuery {
  private filters: Array<{ key: string; value: unknown; op: "eq" | "in" }> = [];
  private pending: { type: "insert" | "update" | "upsert"; value: Row | Row[]; conflict?: string } | null = null;
  private limitValue: number | null = null;

  constructor(private db: MemorySupabase, private table: string) {}

  select() { return this; }
  order() { return this; }
  limit(value: number) { this.limitValue = value; return this; }
  eq(key: string, value: unknown) { this.filters.push({ key, value, op: "eq" }); return this; }
  in(key: string, value: unknown[]) { this.filters.push({ key, value, op: "in" }); return this; }
  like() { return this; }

  insert(value: Row | Row[]) {
    this.pending = { type: "insert", value };
    return this;
  }

  update(value: Row) {
    this.pending = { type: "update", value };
    return this;
  }

  upsert(value: Row | Row[], options?: { onConflict?: string }) {
    this.pending = { type: "upsert", value, conflict: options?.onConflict };
    return this;
  }

  async maybeSingle() {
    const rows = this.readRows();
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    if (this.pending) {
      const rows = this.applyPending();
      return { data: rows[0] ?? null, error: null };
    }
    const rows = this.readRows();
    return { data: rows[0] ?? null, error: null };
  }

  then(resolve: (value: { data?: Row[] | null; error: null }) => void) {
    if (this.pending) {
      const rows = this.applyPending();
      resolve({ data: rows, error: null });
      return;
    }
    resolve({ data: this.readRows(), error: null });
  }

  private readRows(): Row[] {
    let rows = this.db.rows(this.table).filter((row) => this.matches(row));
    if (this.limitValue != null) rows = rows.slice(0, this.limitValue);
    return rows;
  }

  private applyPending(): Row[] {
    const pending = this.pending;
    if (!pending) return [];
    if (pending.type === "insert") {
      const rows = asRows(pending.value).map((row) => ({ id: row.id ?? this.db.nextId(this.table), ...row }));
      this.db.rows(this.table).push(...rows);
      return rows;
    }
    if (pending.type === "update") {
      const rows = this.db.rows(this.table).filter((row) => this.matches(row));
      for (const row of rows) Object.assign(row, pending.value);
      return rows;
    }
    const conflict = (pending.conflict ?? "id").split(",").map((key) => key.trim());
    const out: Row[] = [];
    for (const row of asRows(pending.value)) {
      const existing = this.db.rows(this.table).find((candidate) =>
        conflict.every((key) => candidate[key] === row[key])
      );
      if (existing) {
        Object.assign(existing, row);
        out.push(existing);
      } else {
        const inserted = { id: row.id ?? this.db.nextId(this.table), ...row };
        this.db.rows(this.table).push(inserted);
        out.push(inserted);
      }
    }
    return out;
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      if (filter.op === "eq") return row[filter.key] === filter.value;
      if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(row[filter.key]);
      return true;
    });
  }
}

function asRows(value: Row | Row[]): Row[] {
  return Array.isArray(value) ? value : [value];
}

async function main() {
  testEmptyContextDoesNotInventData();
  testBehaviorPatterns();
  testNorthAlignmentInfluencesScore();
  testPassPatternsReduceScore();
  testCircleAndPlansFlowIntoChatContext();
  testVoiceCommandActionChips();
  testContextTraceSummarySurvivesEmptyContext();
  testIntelligenceReasonCarriesNorthAlignment();
  await testSafeTraceDoesNotCrashMainFlow();
  testScoutPrefersStrategistMissions();
  testChicagoSeedsAreGated();
  testEmptyMissionsDoNotCreateFakeDiscovery();
  testCircleMomentReason();
  testRadarRejectionHasStructuredReason();
  testAutopilotOperationSelection();
  testBootstrapPolicy();
  testAutopilotModeAndPausePolicy();
  testFoundationSprintPolicy();
  testFoundationSprintTimeoutBudget();
  testFoundationOperationStackIsBoundedAndConservative();
  testProviderMissingSummaryAndSourceIdentity();
  testSourceGraphScoringAndCadence();
  testCampaignPlannerUsesContext();
  testCandidateAndLibraryBoundaries();
  testAutopilotCronWiring();
  testCronMiddlewareBypass();
  testAutopilotRunStateMigrationAndControls();
  testTasteSeedParserExtractsOwnerContext();
  testTasteSeedDryRunAndBoundaries();
  testTasteSeedIdempotentKeys();
  testNegativeTasteFiltersAffectScoring();
  testIntentStatesAffectRadarScoringAndResurfacing();
  testIntentActionRouteAndBehaviorWiring();
  testDiscoveryQualityRejectsGenericJunk();
  testQualityFiltersReachCandidateConversionAndPreviews();
  testPromotionFollowThroughContract();
  testTasteSeedRouteAndDocsWiring();
  await testTasteSeedCommitWritesCirclePeople();
  testCandidateInboxConversionContract();
  testTimeoutSafeAutopilotContract();
  testLibraryPreviewAndPromotionDiagnosticsContract();
  testSettingsLibraryVisibilityWiring();
  testPromotionReviewActivityContract();
  testRadarMoveComposerCreatesHumanCopy();
  testMoveShortlistPicksBestSimilarLane();
  testPromotionBridgeAndVisibleCountContracts();
  testHumanOperationLabels();

  console.log("brain coherence tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
