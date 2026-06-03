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
  assert.equal(
    buildCommandActionChips({ message: "save this", sheetContext })[0]?.action_type,
    "save_item",
  );
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

testEmptyContextDoesNotInventData();
testBehaviorPatterns();
testNorthAlignmentInfluencesScore();
testPassPatternsReduceScore();
testCircleAndPlansFlowIntoChatContext();
testVoiceCommandActionChips();

console.log("brain coherence tests passed");
