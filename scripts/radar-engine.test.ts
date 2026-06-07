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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll radar-engine checks passed.");
