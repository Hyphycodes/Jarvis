import assert from "node:assert/strict";
import {
  computeNorthAlignment,
  deriveDayContext,
  summarizeBehaviorPatterns,
  toBrainContextPacket,
  toChatContextPacket,
  type FounderContextPacket,
} from "../lib/context/types";
import { scoreIndexedItem } from "../lib/scoring/scoreIndexedItem";
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
import { planRadarCampaigns } from "../lib/radar/campaigns";
import { qualityTierFromScore } from "../lib/library/quality";
import type { LibraryHealth } from "../lib/library/types";
import { scoreSourceQuality } from "../lib/library/sourceScoring";
import type { ExplorationLane } from "../lib/brain/tasteStrategist";
import type { IndexedItem } from "../lib/index/types";

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
    places: 90,
    events: 35,
    sources: 30,
    organizations: 4,
    people: 24,
    recurringSignals: 4,
    pendingCandidates: 80,
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
    candidateInboxCount: 60,
    sourceCount: 18,
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
    "candidate_inbox_build",
  );
  assert.equal(
    chooseRadarAutopilotOperation({
      health: autopilotHealth({ library: healthyLibrary({ places: 4, depthScore: 0.1 }) }),
      campaigns: [],
    }),
    "library_build",
  );
  assert.equal(
    chooseRadarAutopilotOperation({ health: autopilotHealth({ sourceCount: 2 }), campaigns: [] }),
    "source_building_campaign",
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
        candidateInboxCount: 100,
        library: healthyLibrary({ depthScore: 0.9 }),
        sourceCount: 20,
      }),
      campaigns: [],
    }),
    "no_op",
  );
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
  testSourceGraphScoringAndCadence();
  testCampaignPlannerUsesContext();
  testCandidateAndLibraryBoundaries();

  console.log("brain coherence tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
