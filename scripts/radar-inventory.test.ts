import assert from "node:assert/strict";
import {
  inventoryTargetFor,
  surfaceTargetFor,
  INVENTORY_TARGETS,
} from "../lib/radar/inventoryTargets";
import {
  summarizeCategoryInventory,
  thinSurfaceLanes,
  type SurfaceInventoryRow,
} from "../lib/radar/inventoryHealth";
import { pickFairByCategory } from "../lib/radar/candidateSelection";
import { RADAR_CATEGORIES } from "../lib/radar/category";

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

// ── targets ──────────────────────────────────────────────────────────────────
check("every category has a target with all four layers", () => {
  for (const c of RADAR_CATEGORIES) {
    const t = inventoryTargetFor(c);
    assert.ok(t.raw > 0 && t.researched > 0 && t.ready > 0 && t.surface > 0, `${c} target incomplete`);
  }
});

check("surface target is the calm 7 per lane", () => {
  for (const c of RADAR_CATEGORIES) assert.equal(surfaceTargetFor(c), 7);
});

check("events + finds are shallower than the default warehouse depth", () => {
  assert.ok(inventoryTargetFor("events").ready < inventoryTargetFor("dining").ready);
  assert.ok(inventoryTargetFor("finds").raw < inventoryTargetFor("dining").raw);
  // dining uses the default depth
  assert.equal(INVENTORY_TARGETS.dining.raw, 200);
});

// ── summarizer ───────────────────────────────────────────────────────────────
check("counts shown vs pool by category and computes the gap", () => {
  const rows: SurfaceInventoryRow[] = [
    // dining: 2 shown, 1 pooled
    { category: "dining", status: "shown", destination: "radar" },
    { category: "dining", status: "opened", destination: "radar" },
    { category: "dining", status: "discovered", destination: "radar" },
    // culture: 0 shown, 2 pooled (one discovered, one in holding)
    { category: "culture", status: "discovered", destination: "radar" },
    { category: "culture", status: "shown", destination: "holding" },
    // junk / uncategorized ignored
    { category: null, status: "shown", destination: "radar" },
    { category: "not-a-category", status: "shown", destination: "radar" },
  ];
  const inv = summarizeCategoryInventory(rows);
  assert.equal(inv.dining.shown, 2);
  assert.equal(inv.dining.pool, 1);
  assert.equal(inv.dining.surfaceGap, 5); // 7 - 2
  assert.equal(inv.culture.shown, 0);
  assert.equal(inv.culture.pool, 2);
  assert.equal(inv.culture.surfaceGap, 7);
});

check("a holding 'shown' row counts as pool, not visible", () => {
  const inv = summarizeCategoryInventory([
    { category: "moves", status: "shown", destination: "holding" },
  ]);
  assert.equal(inv.moves.shown, 0);
  assert.equal(inv.moves.pool, 1);
});

// ── thin lanes ───────────────────────────────────────────────────────────────
check("thinSurfaceLanes returns under-target lanes, thinnest first", () => {
  const rows: SurfaceInventoryRow[] = [];
  // dining full (7 shown), places 4 shown, culture 0 shown
  for (let i = 0; i < 7; i++) rows.push({ category: "dining", status: "shown", destination: "radar" });
  for (let i = 0; i < 4; i++) rows.push({ category: "places", status: "shown", destination: "radar" });
  const inv = summarizeCategoryInventory(rows);
  const thin = thinSurfaceLanes(inv);
  assert.ok(!thin.includes("dining"), "dining is full, should not be thin");
  // culture (gap 7) before places (gap 3)
  assert.ok(thin.indexOf("culture") < thin.indexOf("places"), "thinnest lane should rank first");
});

// ── fair per-category challenger window (the thin-lane starvation fix) ────────
check("pickFairByCategory keeps thin lanes that a global slice would drop", () => {
  // Simulate the prod bug: 80 high-score dining rows ahead of 3 moves rows.
  const rows = [
    ...Array.from({ length: 80 }, (_, i) => ({ category: "dining", score: 0.9 - i * 0.001 })),
    { category: "moves", score: 0.55 },
    { category: "moves", score: 0.54 },
    { category: "moves", score: 0.53 },
  ];
  // Old behavior (.slice(0, 40)) would include 0 moves. Fair take must keep them.
  const picked = pickFairByCategory(rows, (r) => r.category, 15, 90);
  const moves = picked.filter((r) => r.category === "moves").length;
  const dining = picked.filter((r) => r.category === "dining").length;
  assert.equal(moves, 3, "all 3 moves candidates must survive");
  assert.equal(dining, 15, "dining capped at perCategoryCap");
});

check("pickFairByCategory buckets null separately and respects totalCap", () => {
  const rows = [
    ...Array.from({ length: 10 }, () => ({ category: null as string | null, score: 0.8 })),
    ...Array.from({ length: 10 }, () => ({ category: "places", score: 0.7 })),
  ];
  const picked = pickFairByCategory(rows, (r) => r.category, 5, 7);
  assert.equal(picked.length, 7, "totalCap honored");
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll radar-inventory checks passed.");
