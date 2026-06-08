import assert from "node:assert/strict";
import {
  blendTasteVector,
  weightsFor,
  preScore,
  emptyTasteVector,
  DEFAULT_WEIGHTS,
  type TasteVector,
} from "../lib/radar/engine/tasteVector";
import {
  selectFinalists,
  decayedScore,
  shouldDisplace,
  enforceRenderDiversity,
  normalizeExternalId,
  BENCH_DECAY_PER_DAY,
} from "../lib/radar/engine/curation";
import {
  buildExperienceTasteSignal,
  tasteValence,
  RATING_STRENGTH,
} from "../lib/radar/engine/tasteSignal";
import { LANE_ENGINE, detailRouteFor, laneCanExpire } from "../lib/radar/engine/lanes";
import { assessLaneReadiness } from "../lib/radar/engine/laneReadiness";
import { radarItemReadyForFeature } from "../lib/radar/engine/radarReadiness";
import { evaluateRecommendationFloor } from "../lib/radar/engine/recommendationFloor";
import { pillarsForItem } from "../lib/radar/engine/pillars";
import { classifyEventSubLibrary, parseSerpEventDate, hasRealEventTime } from "../lib/radar/engine/events/config";
import {
  assessTruth,
  assessUrgency,
  assessFit,
  assessPlanability,
  expiresAtFor,
} from "../lib/radar/engine/events/assess";
import { selectEventsShelf } from "../lib/radar/engine/events/editor";
import { classifyCultureSubLibrary } from "../lib/radar/engine/culture/config";
import {
  assessCultureTruth,
  assessDepth,
  assessCultureFit,
  cultureExpiresAt,
} from "../lib/radar/engine/culture/assess";
import { classifyPlaceSubLibrary } from "../lib/radar/engine/places/config";
import { assessPlaceTruth, assessRole, assessPlaceFit } from "../lib/radar/engine/places/assess";
import { selectPlacesShelf } from "../lib/radar/engine/places/editor";
import { classifyMoveSubLibrary } from "../lib/radar/engine/moves/config";
import { assessMoveTruth, assessMoveFit, assessEnergy, assessWeather } from "../lib/radar/engine/moves/assess";
import { selectMovesShelf } from "../lib/radar/engine/moves/editor";
import { classifyFindSubLibrary, findFamilyKey } from "../lib/radar/engine/finds/config";
import { assessFindTruth, assessFindBudget } from "../lib/radar/engine/finds/assess";
import { selectFindsShelf } from "../lib/radar/engine/finds/editor";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL  ${name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

// ── taste vector ─────────────────────────────────────────────────────────────
check("blendTasteVector normalizes by weight sum and clamps", () => {
  const v: TasteVector = { craft: 1, fit: 1, timing: 1, novelty: 1, relational: 1 };
  assert.equal(blendTasteVector(v, DEFAULT_WEIGHTS), 1); // all-1 vector → 1
  assert.equal(blendTasteVector(emptyTasteVector(), DEFAULT_WEIGHTS), 0);
});

check("blendTasteVector weights craft/fit higher for dining", () => {
  const craftOnly: TasteVector = { craft: 1, fit: 0, timing: 0, novelty: 0, relational: 0 };
  const relationalOnly: TasteVector = { craft: 0, fit: 0, timing: 0, novelty: 0, relational: 1 };
  // dining_restaurants weights craft (0.34) >> relational (0.10)
  assert.ok(preScore(craftOnly, "dining_restaurants") > preScore(relationalOnly, "dining_restaurants"));
});

check("weightsFor falls back to default for unknown sub-library", () => {
  assert.deepEqual(weightsFor("nope_nonexistent"), DEFAULT_WEIGHTS);
  assert.equal(weightsFor("dining_restaurants").craft, 0.34);
});

// ── finalists ────────────────────────────────────────────────────────────────
check("selectFinalists takes the top slice by score", () => {
  const items = [{ s: 0.2 }, { s: 0.9 }, { s: 0.5 }, { s: 0.7 }];
  const top2 = selectFinalists(items, (i) => i.s, 2);
  assert.deepEqual(top2.map((i) => i.s), [0.9, 0.7]);
  assert.deepEqual(selectFinalists(items, (i) => i.s, 0), []);
});

// ── decay ────────────────────────────────────────────────────────────────────
check("decayedScore subtracts 0.01/day", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  const tenDaysAgo = "2026-05-31T00:00:00Z";
  assert.ok(Math.abs(decayedScore(0.9, tenDaysAgo, now) - (0.9 - 10 * BENCH_DECAY_PER_DAY)) < 1e-9);
  assert.equal(decayedScore(0.8, "2026-06-10T00:00:00Z", now), 0.8); // 0 days
  assert.equal(decayedScore(0.8, "not-a-date", now), 0.8); // bad date → unchanged
});

// ── displacement ─────────────────────────────────────────────────────────────
check("shouldDisplace: open slot admits, full bench bumps the lowest", () => {
  assert.deepEqual(shouldDisplace([0.9, 0.8], 0.5, 3), { displace: true, victimIndex: -1 }); // open
  assert.deepEqual(shouldDisplace([0.9, 0.6, 0.8], 0.7, 3), { displace: true, victimIndex: 1 }); // bump 0.6
  assert.deepEqual(shouldDisplace([0.9, 0.6, 0.8], 0.5, 3), { displace: false, victimIndex: -1 }); // too weak
});

// ── render diversity ─────────────────────────────────────────────────────────
check("enforceRenderDiversity caps per sub_type and per neighborhood", () => {
  const ranked = [
    { id: 1, st: "natural_wine", nb: "Logan Square" },
    { id: 2, st: "natural_wine", nb: "Logan Square" },
    { id: 3, st: "natural_wine", nb: "Logan Square" }, // 3rd natural_wine → dropped (max 2)
    { id: 4, st: "steakhouse", nb: "Logan Square" },
    { id: 5, st: "omakase", nb: "Logan Square" }, // 4th Logan Square → dropped (max 3)
    { id: 6, st: "omakase", nb: "West Loop" },
  ];
  const out = enforceRenderDiversity(ranked, {
    limit: 7,
    maxPerSubType: 2,
    maxPerNeighborhood: 3,
    subType: (i) => i.st,
    neighborhood: (i) => i.nb,
  });
  assert.deepEqual(out.map((i) => i.id), [1, 2, 4, 6]);
});

check("enforceRenderDiversity respects the limit", () => {
  const ranked = Array.from({ length: 20 }, (_, i) => ({ id: i, st: `t${i}`, nb: `n${i}` }));
  assert.equal(
    enforceRenderDiversity(ranked, { limit: 7, maxPerSubType: 2, maxPerNeighborhood: 3, subType: (i) => i.st, neighborhood: (i) => i.nb }).length,
    7,
  );
});

// ── dedup ────────────────────────────────────────────────────────────────────
check("normalizeExternalId produces a stable kebab key", () => {
  assert.equal(normalizeExternalId("  Daisy's Po'Boys & Tavern  "), "daisy-s-po-boys-tavern");
  assert.equal(normalizeExternalId("Café Obélix"), "cafe-obelix");
  assert.equal(
    normalizeExternalId("Green Mill"),
    normalizeExternalId("green   mill"),
  );
});

// ── experience memory taste signal ───────────────────────────────────────────
check("tasteValence: loved/good positive, meh/not_for_me negative", () => {
  assert.equal(tasteValence("loved"), "positive");
  assert.equal(tasteValence("good"), "positive");
  assert.equal(tasteValence("meh"), "negative");
  assert.equal(tasteValence("not_for_me"), "negative");
});

check("RATING_STRENGTH ranks conviction (loved > not_for_me > good > meh)", () => {
  assert.ok(RATING_STRENGTH.loved > RATING_STRENGTH.not_for_me);
  assert.ok(RATING_STRENGTH.not_for_me > RATING_STRENGTH.good);
  assert.ok(RATING_STRENGTH.good > RATING_STRENGTH.meh);
});

check("buildExperienceTasteSignal carries dimensions + valence/strength", () => {
  const sig = buildExperienceTasteSignal(
    { rating: "loved", wouldReturn: true, spendAmount: 150, companions: ["Sophia"], notes: "great mole" },
    { lane: "dining", venueName: "Topolobampo", neighborhood: "River North", subType: "tasting_menu", cuisine: "Mexican", tags: ["date"] },
  ) as Record<string, unknown>;
  assert.equal(sig.valence, "positive");
  assert.equal(sig.strength, 1.0);
  assert.equal(sig.venue, "Topolobampo");
  assert.equal(sig.lane, "dining");
  assert.equal(sig.neighborhood, "River North");
  assert.equal(sig.sub_type, "tasting_menu");
  assert.equal(sig.cuisine, "Mexican");
  assert.equal(sig.would_return, true);
  assert.equal(sig.spend, 150);
  assert.deepEqual(sig.companions, ["Sophia"]);
  assert.equal(sig.notes_summary, "great mole");
});

check("buildExperienceTasteSignal: negative valence + notes truncated to 280", () => {
  const sig = buildExperienceTasteSignal(
    { rating: "not_for_me", notes: "x".repeat(500) },
    { lane: "dining", venueName: "X", neighborhood: null, subType: null, cuisine: null, tags: [] },
  ) as Record<string, unknown>;
  assert.equal(sig.valence, "negative");
  assert.equal((sig.notes_summary as string).length, 280);
});

// ── lane contract ─────────────────────────────────────────────────────────────
check("LANE_ENGINE: detail routes + expire semantics per lane", () => {
  assert.equal(detailRouteFor("finds"), "find");
  assert.equal(detailRouteFor("dining"), "plan");
  assert.equal(detailRouteFor("places"), "brief");
  assert.equal(detailRouteFor("culture"), "brief");
  assert.equal(laneCanExpire("events"), true);
  assert.equal(laneCanExpire("dining"), false);
  assert.equal(LANE_ENGINE.finds.canSchedule, false);
  assert.equal(LANE_ENGINE.events.canSchedule, true);
});

// ── lane readiness ────────────────────────────────────────────────────────────
check("assessLaneReadiness: events need date+venue+source", () => {
  const bare = assessLaneReadiness({ lane: "events", title: "Some show" });
  assert.equal(bare.ready, false);
  assert.deepEqual(bare.missing.sort(), ["date_time", "source", "venue"]);
  const full = assessLaneReadiness({
    lane: "events",
    title: "Show",
    startsAt: "2026-07-01T20:00:00Z",
    venue: "Thalia Hall",
    sourceUrl: "https://tickets.example/show",
  });
  assert.equal(full.ready, true);
});

check("assessLaneReadiness: finds need price+image+budget_tier; unknown lane passes", () => {
  assert.equal(assessLaneReadiness({ lane: "finds", title: "X" }).ready, false);
  assert.equal(
    assessLaneReadiness({ lane: "finds", price: "$120", imageUrl: "https://x/y.jpg", budgetTier: "premium_realistic" }).ready,
    true,
  );
  assert.equal(assessLaneReadiness({ lane: "weird_lane", title: "x" }).ready, true);
});

check("assessLaneReadiness: dated culture must carry a date", () => {
  const datedNoDate = assessLaneReadiness({ lane: "culture", title: "Jazz night", isDated: true });
  assert.ok(datedNoDate.missing.includes("date_time"));
  const timeless = assessLaneReadiness({ lane: "culture", culturalReason: "Bauhaus retrospective" });
  assert.equal(timeless.ready, true);
});

// ── radar readiness contract ────────────────────────────────────────────────
const GOOD_IMG = "https://venue.example/photo.jpg";

check("readiness: a complete dining card with a ready plan is featured", () => {
  const r = radarItemReadyForFeature({
    lane: "dining",
    title: "Kasama",
    description: "Michelin Filipino tasting in Ukrainian Village.",
    score: 0.82,
    imageUrl: GOOD_IMG,
    hasPlanRef: true,
    planReady: true,
  });
  assert.equal(r.ready, true);
  assert.deepEqual(r.missing, []);
  assert.equal(r.route, "plan");
  assert.equal(r.imageReady, true);
  assert.equal(r.planReady, true);
  assert.equal(r.detailReady, true);
});

check("readiness: a card that opens a half-built plan is held", () => {
  const r = radarItemReadyForFeature({
    lane: "dining",
    title: "Kasama",
    description: "great spot",
    score: 0.8,
    imageUrl: GOOD_IMG,
    hasPlanRef: true,
    planReady: false, // building / failed / cancelled
  });
  assert.equal(r.ready, false);
  assert.ok(r.missing.includes("plan"));
  assert.equal(r.detailReady, false);
});

check("readiness: a plan-lane card with NO plan ref still passes on card+image", () => {
  // No "open plan" advertised → it renders as a brief, owes only card + image.
  const r = radarItemReadyForFeature({
    lane: "moves",
    title: "Sunrise lakefront run",
    description: "Easy 3 miles before work.",
    score: 0.7,
    imageUrl: GOOD_IMG,
    hasPlanRef: false,
  });
  assert.equal(r.ready, true);
  assert.equal(r.planReady, true);
});

check("readiness: every lane needs a real image (blank/stock held)", () => {
  const blank = radarItemReadyForFeature({ lane: "places", title: "X", description: "y", score: 0.6 });
  assert.equal(blank.ready, false);
  assert.ok(blank.missing.includes("image"));
  assert.equal(blank.imageReady, false);
  const stock = radarItemReadyForFeature({
    lane: "places",
    title: "X",
    description: "y",
    score: 0.6,
    imageUrl: "https://www.gettyimages.com/photo/123.jpg",
  });
  assert.equal(stock.imageReady, false); // editorial/stock host rejected
});

check("readiness: finds use the /find dossier gate, not a plan", () => {
  const ready = radarItemReadyForFeature({
    lane: "finds",
    title: "Linen camp-collar shirt",
    description: "A summer staple in a quiet palette.",
    score: 0.75,
    imageUrl: GOOD_IMG,
    findsReady: true,
    hasPlanRef: true, // a stray plan ref must NOT gate a find
    planReady: false,
  });
  assert.equal(ready.route, "find");
  assert.equal(ready.ready, true); // plan ignored; dossier is ready
  const notReady = radarItemReadyForFeature({
    lane: "finds",
    title: "Watch",
    description: "y",
    score: 0.9,
    imageUrl: GOOD_IMG,
    findsReady: false,
  });
  assert.equal(notReady.ready, false);
  assert.ok(notReady.missing.includes("product_detail"));
});

check("readiness: events need a real date + venue", () => {
  const bare = radarItemReadyForFeature({
    lane: "events",
    title: "Some show",
    description: "y",
    score: 0.8,
    imageUrl: GOOD_IMG,
  });
  assert.equal(bare.ready, false);
  assert.ok(bare.missing.includes("date_time"));
  assert.ok(bare.missing.includes("venue"));
  const full = radarItemReadyForFeature({
    lane: "events",
    title: "Jazz quartet",
    description: "Live at the Green Mill.",
    score: 0.8,
    imageUrl: GOOD_IMG,
    startsAt: "2026-07-01T20:00:00Z",
    venue: "Green Mill",
  });
  assert.equal(full.ready, true);
});

check("readiness: missing card basics (title/reason/score) are blockers", () => {
  const r = radarItemReadyForFeature({ lane: "culture", imageUrl: GOOD_IMG });
  assert.equal(r.ready, false);
  assert.ok(r.missing.includes("title"));
  assert.ok(r.missing.includes("description"));
  assert.ok(r.missing.includes("score"));
  // score=0 is a valid score, not "missing"
  const zero = radarItemReadyForFeature({
    lane: "culture",
    title: "Permanent collection",
    description: "Evergreen.",
    score: 0,
    imageUrl: GOOD_IMG,
  });
  assert.equal(zero.ready, true);
});

// ── recommendation floor ──────────────────────────────────────────────────────
check("recommendationFloor: suppresses wrong category + stale events + duplicate", () => {
  assert.deepEqual(
    evaluateRecommendationFloor({ lane: "dining", classifiedCategory: "places", tasteScore: 0.9 }).suppressed_because,
    ["wrong_category"],
  );
  const stale = evaluateRecommendationFloor({
    lane: "events",
    classifiedCategory: "events",
    startsAt: "2020-01-01T00:00:00Z",
    tasteScore: 0.9,
  });
  assert.ok(stale.suppressed_because.includes("stale_dated"));
  assert.ok(evaluateRecommendationFloor({ lane: "dining", isDuplicate: true, tasteScore: 0.9 }).suppressed_because.includes("duplicate"));
});

check("recommendationFloor: fantasy luxury blocked unless allowed/requested", () => {
  assert.ok(
    evaluateRecommendationFloor({ lane: "finds", isFantasyLuxury: true, tasteScore: 0.9 }).suppressed_because.includes("fantasy_luxury"),
  );
  assert.equal(
    evaluateRecommendationFloor({ lane: "finds", isFantasyLuxury: true, userRequested: true, tasteScore: 0.9 }).ok,
    true,
  );
});

check("recommendationFloor: generic/weak suppressed, strong passes", () => {
  assert.ok(evaluateRecommendationFloor({ lane: "dining", title: "a nice spot" }).suppressed_because.includes("generic_or_weak"));
  assert.equal(
    evaluateRecommendationFloor({ lane: "dining", title: "Kasama", reasons: ["Michelin Filipino tasting"], tasteScore: 0.8 }).ok,
    true,
  );
});

// ── pillar tagging ────────────────────────────────────────────────────────────
check("pillarsForItem: content kernel first, lane default fallback", () => {
  const dinner = pillarsForItem({ lane: "dining", category: "dining", title: "Dinner with friends", tags: ["friends"] });
  assert.ok(dinner.includes("taste"));
  const fallback = pillarsForItem({ lane: "places", title: "" });
  assert.ok(fallback.length > 0); // falls back to lane default pillars
});

// ── events: sub-library classification ────────────────────────────────────────
check("classifyEventSubLibrary: event_type wins, then keywords", () => {
  assert.equal(classifyEventSubLibrary({ event_type: "dj_set" }), "events_music");
  assert.equal(classifyEventSubLibrary({ event_type: "wine_event" }), "events_food");
  assert.equal(classifyEventSubLibrary({ event_type: "art_opening" }), "events_art");
  // keyword fallback, most-specific first
  assert.equal(classifyEventSubLibrary({ title: "Movies in the Park: lakefront screening" }), "events_outdoor");
  assert.equal(classifyEventSubLibrary({ title: "Gallery opening + artist talk" }), "events_art");
  assert.equal(classifyEventSubLibrary({ title: "Wine dinner with the chef" }), "events_food");
  assert.equal(classifyEventSubLibrary({ title: "Jazz quartet live" }), "events_music");
});

// ── events: truth ────────────────────────────────────────────────────────────
check("assessTruth: needs_enrichment when date/venue/source missing; official when ticketed", () => {
  const bare = assessTruth({ title: "Show" });
  assert.equal(bare.needs_enrichment, true);
  assert.ok(bare.unsupported_claims.includes("no_real_date"));
  const full = assessTruth({
    starts_at: "2026-07-01T20:00:00Z",
    venue_name: "Thalia Hall",
    ticket_url: "https://tickets.example/x",
  });
  assert.equal(full.needs_enrichment, false);
  assert.equal(full.source_quality, "official");
  assert.ok(full.datetime_confidence > 0.8);
});

// ── events: urgency ──────────────────────────────────────────────────────────
check("assessUrgency: now / soon / low / expired", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  assert.equal(assessUrgency({ starts_at: "2026-06-10T23:00:00Z" }, now).urgency, "now");
  assert.equal(assessUrgency({ starts_at: "2026-06-13T20:00:00Z" }, now).urgency, "soon");
  assert.equal(assessUrgency({ starts_at: "2026-07-30T20:00:00Z" }, now).urgency, "low");
  assert.equal(assessUrgency({ starts_at: "2026-06-01T20:00:00Z" }, now).urgency, "expired");
});

// ── events: fit ──────────────────────────────────────────────────────────────
check("assessFit: today surfaces today; outdoor bad weather vetoes; stretch budget", () => {
  const now = new Date("2026-06-10T09:00:00Z");
  const today = assessFit({ starts_at: "2026-06-10T23:00:00Z", venue_name: "X" }, { now });
  assert.equal(today.timing_fit, "today");
  assert.equal(today.recommended_surface, "today");
  const wet = assessFit(
    { starts_at: "2026-06-12T18:00:00Z", sub_library: "events_outdoor" },
    { now, weatherBadOnEventDay: true },
  );
  assert.ok(wet.vetoes.includes("bad_weather_outdoor"));
  assert.equal(wet.recommended_surface, "suppress");
  const pricey = assessFit({ starts_at: "2026-06-20T20:00:00Z", price_max: 500 }, { now, premiumThreshold: 300 });
  assert.equal(pricey.budget_fit, "stretch");
});

// ── events: planability + expiration ──────────────────────────────────────────
check("assessPlanability: plan_ready needs time+venue+source; arrival 20m early", () => {
  const ready = assessPlanability({ starts_at: "2026-07-01T20:00:00Z", venue_name: "Hall", ticket_url: "https://t/x" });
  assert.equal(ready.plan_ready, true);
  assert.ok(ready.suggested_arrival && new Date(ready.suggested_arrival) < new Date("2026-07-01T20:00:00Z"));
  assert.equal(assessPlanability({ title: "x" }).plan_ready, false);
});

check("expiresAtFor: end+24h else start+24h", () => {
  assert.equal(expiresAtFor({ starts_at: "2026-07-01T20:00:00Z" }), "2026-07-02T20:00:00.000Z");
  assert.equal(
    expiresAtFor({ starts_at: "2026-07-01T20:00:00Z", ends_at: "2026-07-01T23:00:00Z" }),
    "2026-07-02T23:00:00.000Z",
  );
  assert.equal(expiresAtFor({}), null);
});

// ── events: editor shelf assembly ──────────────────────────────────────────────
check("selectEventsShelf: sub-library variety + venue cap + urgency bump", () => {
  const c = (id: string, sub: string, venue: string, score: number, urgency = "normal") => ({
    id, sub_library: sub, venue, final_score: score, urgency, starts_at: "2026-07-01T20:00:00Z",
  });
  const { featured } = selectEventsShelf(
    [
      c("a", "events_music", "Green Mill", 0.9),
      c("b", "events_music", "Green Mill", 0.88), // same venue → capped out
      c("c", "events_music", "Constellation", 0.86),
      c("d", "events_music", "Thalia", 0.84), // 4th music → over maxPerSubLibrary(3) but venue ok... capped by sub
      c("e", "events_food", "Kasama", 0.7),
      c("f", "events_outdoor", "Millennium Park", 0.5, "now"), // urgency bump
    ],
    { limit: 7, maxPerSubLibrary: 3, maxPerVenue: 1 },
  );
  const ids = featured.map((f) => f.id);
  assert.ok(ids.includes("a") && !ids.includes("b")); // venue cap drops the 2nd Green Mill
  assert.ok(ids.includes("e") && ids.includes("f")); // variety + urgency keep food/outdoor
  assert.ok(featured.filter((f) => f.sub_library === "events_music").length <= 3);
});

// ── events: SerpAPI date parsing + real-time guard (Events rescue) ────────────
check("parseSerpEventDate: parses 'when' with a time range (start time wins)", () => {
  // "Sat, Aug 15, 7 – 10 PM" → Aug 15, 19:00 America/Chicago (CDT, -5) = 00:00Z next day.
  const iso = parseSerpEventDate("Sat, Aug 15, 7 – 10 PM", "Aug 15");
  assert.ok(iso, "should parse");
  const local = new Date(iso!).toLocaleString("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  assert.equal(local, "19:00"); // real 7 PM Chicago, not dropped
});

check("parseSerpEventDate: falls back to start_date when 'when' has no time", () => {
  const iso = parseSerpEventDate("Some Festival", "Sep 3"); // when carries no month/day
  assert.ok(iso);
  const parts = new Date(iso!).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "2-digit", hourCycle: "h23" });
  assert.ok(parts.includes("Sep 3")); // date kept
  assert.ok(parts.includes("19")); // default evening window, never midnight
});

check("parseSerpEventDate: rejects unparseable, rolls past dates to next year", () => {
  assert.equal(parseSerpEventDate(null, null), null);
  assert.equal(parseSerpEventDate("no date here", null), null);
  const iso = parseSerpEventDate("Jan 5, 8 PM", "Jan 5"); // past in-year → next year
  assert.ok(iso && new Date(iso).getTime() > Date.now());
});

check("hasRealEventTime: keeps 7 PM Chicago (00:00 UTC), drops local midnight", () => {
  // 7 PM CDT show stored as 00:00 UTC — the bug that killed real evening events.
  assert.equal(hasRealEventTime("2026-08-16T00:00:00Z"), true);
  assert.equal(hasRealEventTime("2026-08-16T19:00:00-05:00"), true);
  // A genuine LOCAL midnight (date-only artifact) → not a real time.
  assert.equal(hasRealEventTime("2026-08-16T05:00:00Z"), false); // 00:00 America/Chicago (CDT)
  assert.equal(hasRealEventTime(null), false);
  assert.equal(hasRealEventTime("garbage"), false);
});

// ── culture: classification ────────────────────────────────────────────────────
check("classifyCultureSubLibrary: screenings/performances/arch/exhibits", () => {
  assert.equal(classifyCultureSubLibrary({ title: "Tarkovsky retrospective at the Music Box" }), "culture_screenings");
  assert.equal(classifyCultureSubLibrary({ title: "CSO: Mahler symphony" }), "culture_performances");
  assert.equal(classifyCultureSubLibrary({ title: "Mies van der Rohe architecture exhibit" }), "culture_architecture_design");
  assert.equal(classifyCultureSubLibrary({ title: "Photography collection at the Art Institute" }), "culture_exhibits");
  assert.equal(classifyCultureSubLibrary({ title: "Something vague" }), "culture_exhibits"); // default
});

// ── culture: truth / depth / fit / expiration ────────────────────────────────
check("assessCultureTruth: needs institution + source; is_dated only when dated", () => {
  assert.equal(assessCultureTruth({ title: "X" }).needs_enrichment, true);
  const t = assessCultureTruth({ title: "Show", institution_name: "Art Institute", source_url: "https://artic.edu/x" });
  assert.equal(t.needs_enrichment, false);
  assert.equal(t.source_quality, "official");
  assert.equal(t.is_dated, false);
  assert.equal(assessCultureTruth({ title: "Y", is_dated: true, starts_at: "2026-07-01T19:00:00Z" }).is_dated, true);
});

check("assessDepth: curatorial language is deep; instagram bait is shallow", () => {
  const deep = assessDepth({
    title: "Curatorial retrospective",
    institution_name: "MCA",
    description: "A major retrospective tracing the artist's material practice across four decades with rare provenance.",
    vibe_keywords: ["exhibition"],
  });
  assert.ok(deep.depth_score >= 0.7 && (deep.substance === "deep" || deep.substance === "solid"));
  const shallow = assessDepth({ title: "Immersive selfie lights experience room", description: "instagrammable" });
  assert.equal(shallow.substance, "shallow");
});

check("assessCultureFit: timeless never expires/suppresses; expired dated vetoes", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  const timeless = assessCultureFit({ title: "Permanent collection", is_dated: false }, { now });
  assert.equal(timeless.recommended_surface, "radar"); // evergreen lives on radar, not suppressed
  assert.equal(cultureExpiresAt({ is_dated: false, starts_at: "2026-06-01T00:00:00Z" }), null);
  const staleDated = assessCultureFit({ is_dated: true, starts_at: "2026-06-01T19:00:00Z" }, { now });
  assert.ok(staleDated.vetoes.includes("expired_dated"));
  assert.equal(staleDated.recommended_surface, "suppress");
  // dated temporary exhibit expires; timeless does not
  assert.equal(cultureExpiresAt({ is_dated: true, ends_at: "2026-07-01T00:00:00Z" }), "2026-07-02T00:00:00.000Z");
});

// ── places: classification / truth / role / fit / editor ─────────────────────
check("classifyPlaceSubLibrary: outdoor/neighborhood/venue", () => {
  assert.equal(classifyPlaceSubLibrary({ title: "Lakefront Trail", place_type: "outdoor" }), "places_outdoor");
  assert.equal(classifyPlaceSubLibrary({ title: "Logan Square corridor", place_type: "neighborhood" }), "places_neighborhoods");
  assert.equal(classifyPlaceSubLibrary({ title: "The Allis hotel lobby" }), "places_venues");
  assert.equal(classifyPlaceSubLibrary({ title: "Riverwalk pocket" }), "places_outdoor");
});

check("assessPlaceTruth: google_place_id = verified; no location → needs_enrichment", () => {
  const v = assessPlaceTruth({ title: "X", google_place_id: "g123", lat: 41.9, lng: -87.6 });
  assert.equal(v.source_quality, "verified");
  assert.ok(v.location_confidence > 0.9 && !v.needs_enrichment);
  assert.equal(assessPlaceTruth({ title: "Y" }).needs_enrichment, true);
});

check("assessRole: cigar → cigar_walk_zone; outdoor → quiet_reset; bookstore → creative_input", () => {
  assert.equal(assessRole({ title: "Gold Coast cigar walk", vibe_keywords: ["cigar"] }).primary_role, "cigar_walk_zone");
  assert.equal(assessRole({ title: "Lincoln Park lakefront", sub_library: "places_outdoor" }).primary_role, "quiet_reset");
  assert.equal(assessRole({ title: "Sandmeyer's Bookstore", place_type: "bookstore" }).primary_role, "creative_input");
});

check("assessPlaceFit: evergreen → radar; outdoor bad weather → reserve", () => {
  assert.equal(assessPlaceFit({ title: "Lobby" }).recommended_surface, "radar");
  const wet = assessPlaceFit({ title: "Park", sub_library: "places_outdoor" }, { weatherBad: true });
  assert.equal(wet.recommended_surface, "reserve");
  assert.equal(wet.friction_level, "high");
});

check("selectPlacesShelf: neighborhood + role caps spread the shelf", () => {
  const c = (id: string, sub: string, nb: string, role: string, score: number) => ({ id, sub_library: sub, neighborhood: nb, primary_role: role, final_score: score });
  const { featured } = selectPlacesShelf(
    [
      c("a", "places_outdoor", "Lincoln Park", "quiet_reset", 0.9),
      c("b", "places_outdoor", "Lincoln Park", "quiet_reset", 0.88), // same nb+role → out
      c("c", "places_venues", "Gold Coast", "meeting_spot", 0.8),
      c("d", "places_neighborhoods", "Logan Square", "drift_zone", 0.7),
    ],
    { limit: 7, maxPerSubLibrary: 3, maxPerNeighborhood: 1, maxPerRole: 2 },
  );
  const ids = featured.map((f) => f.id);
  assert.ok(ids.includes("a") && !ids.includes("b")); // same-neighborhood cap drops the 2nd Lincoln Park
  assert.ok(ids.includes("c") && ids.includes("d"));
});

// ── moves: classification / truth / fit / energy / weather / editor ───────────
check("classifyMoveSubLibrary: sports/training/recovery/creative/outdoor", () => {
  assert.equal(classifyMoveSubLibrary({ title: "Pickup basketball shootaround" }), "moves_sports");
  assert.equal(classifyMoveSubLibrary({ title: "Boxing class + conditioning" }), "moves_training");
  assert.equal(classifyMoveSubLibrary({ title: "Sunday reset + meal prep" }), "moves_recovery");
  assert.equal(classifyMoveSubLibrary({ title: "Camera walk before sunset" }), "moves_creative");
  assert.equal(classifyMoveSubLibrary({ title: "Gold Coast cigar walk" }), "moves_outdoor");
});

check("assessMoveTruth: no sequence → needs_enrichment; bookable needs source", () => {
  assert.equal(assessMoveTruth({ title: "Vague" }).needs_enrichment, true);
  const free = assessMoveTruth({ title: "Walk", move_kind: "self_directed", sequence: [{ label: "Start at the lakefront" }, { label: "Walk north 30 min" }] });
  assert.equal(free.needs_enrichment, false); // free move valid with a concrete sequence
  const paid = assessMoveTruth({ title: "Golf lesson", move_kind: "bookable", sequence: [{ label: "Range lesson" }] });
  assert.equal(paid.needs_enrichment, true); // bookable needs a source
});

check("assessEnergy + assessWeather: recovery restorative; outdoor bad weather", () => {
  assert.equal(assessEnergy({ sub_library: "moves_recovery" }).energy_payoff, "restorative");
  assert.equal(assessEnergy({ sub_library: "moves_training" }).energy_required, "high");
  const w = assessWeather({ title: "Lakefront walk", sub_library: "moves_outdoor" }, { weatherBad: true });
  assert.equal(w.weather_fit, "bad");
  assert.ok(w.alternative_if_bad);
});

check("assessMoveFit: recovery-mode kills high-energy; outdoor bad weather → reserve", () => {
  const now = new Date("2026-06-13T15:00:00Z"); // a Saturday
  const recoveryClash = assessMoveFit({ title: "Boxing", sub_library: "moves_training" }, { now, operatingMode: "recovery" });
  assert.equal(recoveryClash.energy_fit, "too_much");
  const wet = assessMoveFit({ title: "Cigar walk", sub_library: "moves_outdoor" }, { now, weatherBad: true });
  assert.ok(wet.vetoes.includes("bad_weather_outdoor"));
  assert.equal(wet.recommended_surface, "reserve"); // weather pause, not suppress
});

check("selectMovesShelf: sub-library cap spreads beyond one move type", () => {
  const c = (id: string, sub: string, e: string, s: number) => ({ id, sub_library: sub, energy_required: e, final_score: s });
  const { featured } = selectMovesShelf(
    [
      c("a", "moves_training", "high", 0.9),
      c("b", "moves_training", "high", 0.88),
      c("c", "moves_training", "high", 0.86), // 3rd training → capped (max 2)
      c("d", "moves_outdoor", "low", 0.7),
      c("e", "moves_recovery", "low", 0.65),
    ],
    { limit: 7, maxPerSubLibrary: 2, maxPerEnergy: 4 },
  );
  const ids = featured.map((f) => f.id);
  assert.ok(ids.includes("a") && ids.includes("b") && !ids.includes("c"));
  assert.ok(ids.includes("d") && ids.includes("e")); // variety
});

// ── finds: keeps its own UI route ────────────────────────────────────────────
check("finds detail route is 'find' (protected buyer UI, not a plan)", () => {
  assert.equal(detailRouteFor("finds"), "find");
  assert.notEqual(detailRouteFor("finds"), "plan");
});

check("classifyFindSubLibrary + findFamilyKey: watch keyword + brand family", () => {
  assert.equal(classifyFindSubLibrary({ source_brain: "style", subcategory: "dive watch" }), "finds_watches");
  assert.equal(classifyFindSubLibrary({ source_brain: "style", subcategory: "linen shirt" }), "finds_clothing");
  // Charvet shirt variants share a family key → dedup cluster
  assert.equal(
    findFamilyKey({ brand: "Charvet", subcategory: "Shirt Program" }),
    findFamilyKey({ brand: "Charvet", subcategory: "Shirt Program" }),
  );
});

check("assessFindTruth: needs URL+image to be buy-ready", () => {
  assert.equal(assessFindTruth({ title: "X", price: "$120" }).needs_more_research, true);
  const ready = assessFindTruth({ title: "Shirt", price: "$120", retailer: "Drake's", product_url: "https://drakes.com/x", image_url: "https://drakes.com/x.jpg", research_state: "ready" });
  assert.equal(ready.needs_more_research, false);
  assert.ok(ready.product_confidence > 0.8);
});

check("assessFindBudget: fantasy luxury holds unless requested; $100k balanced default", () => {
  const watch = assessFindBudget({ title: "Rolex", price: "$12,000" }, { premiumThreshold: 300, aspirationalFrequency: "rare_unless_requested" });
  assert.equal(watch.budget_tier, "hold");
  assert.equal(watch.requires_user_request, true);
  assert.equal(watch.should_surface_background, false);
  const requested = assessFindBudget({ title: "Rolex", price: "$12,000", userRequested: true }, { premiumThreshold: 300 });
  assert.equal(requested.should_surface_background, true); // he asked
  assert.equal(assessFindBudget({ title: "Tee", price: "$40" }, {}).budget_tier, "attainable");
  assert.equal(assessFindBudget({ title: "Jacket", price: "$250" }, { premiumThreshold: 300 }).budget_tier, "premium_realistic");
});

check("selectFindsShelf: no Charvet wall (1/family, 2/brain, 1 aspirational)", () => {
  const c = (id: string, fam: string, brain: string, tier: string, score: number, req = false) => ({
    id, titleKey: id, familyKey: fam, productUrl: `https://x/${id}`, sourceBrain: brain, budgetTier: tier, finalScore: score, userRequested: req,
  });
  const { featured } = selectFindsShelf(
    [
      c("a", "charvet:shirt", "style", "premium_realistic", 0.9),
      c("b", "charvet:shirt", "style", "premium_realistic", 0.88), // same family → reserve
      c("c", "drakes:knit", "style", "premium_realistic", 0.86),
      c("d", "loro:scarf", "style", "premium_realistic", 0.84), // 3rd style → over maxPerSourceBrain(2)
      c("e", "leica:camera", "gear", "premium_realistic", 0.7),
      c("f", "rolex:watch", "watches", "aspirational", 0.95),
      c("g", "omega:watch", "watches", "aspirational", 0.93), // 2nd aspirational → reserve
    ],
    { limit: 7, maxPerSourceBrain: 2, maxAspirational: 1 },
  );
  const ids = featured.map((x) => x.id);
  assert.ok(ids.includes("a") && !ids.includes("b")); // family cap
  assert.ok(!ids.includes("d")); // source-brain cap (style maxed at 2)
  assert.ok(ids.includes("f") && !ids.includes("g")); // 1 aspirational only
  assert.ok(ids.includes("e")); // variety from another brain
});

check("selectFindsShelf: hold tier never features in background; user-requested bypasses caps", () => {
  const held = selectFindsShelf([{ id: "h", titleKey: "h", familyKey: "x:y", sourceBrain: "watches", budgetTier: "hold", finalScore: 0.99 }], {});
  assert.equal(held.featured.length, 0);
  const requested = selectFindsShelf([{ id: "r", titleKey: "r", familyKey: "x:y", sourceBrain: "watches", budgetTier: "hold", finalScore: 0.5, userRequested: true }], {});
  assert.equal(requested.featured.length, 1); // he asked for it
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll radar-engine checks passed.");
