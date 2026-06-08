import assert from "node:assert/strict";
import {
  DEFAULT_OPERATING_PREFERENCES,
  normalizeOperatingPreferences,
  spendContextForResearcher,
  operatingSummaryLine,
  operatingFitBlock,
  formatIncomeRange,
  comfortLabel,
} from "../lib/operating/operatingPreferences";

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

// ── defaults ──────────────────────────────────────────────────────────────────
check("defaults reflect Jerry's stated baseline", () => {
  const d = DEFAULT_OPERATING_PREFERENCES;
  assert.equal(d.operatingMode, "balanced");
  assert.equal(d.spendMode, "balanced");
  assert.equal(d.findsComfort, "premium_realistic");
  assert.equal(d.premiumThreshold, 300);
  assert.equal(d.aspirationalFrequency, "rare_unless_requested");
  assert.equal(d.sundayReset, true);
});

// ── normalize ─────────────────────────────────────────────────────────────────
check("normalize reads a snake_case DB row", () => {
  const p = normalizeOperatingPreferences({
    operating_mode: "saving",
    spend_mode: "saving",
    finds_comfort: "attainable",
    premium_threshold: 150,
    dining_normal_min: 20,
    dining_normal_max: 50,
    preferred_plan_windows: ["weekend"],
    sunday_reset: false,
  });
  assert.equal(p.operatingMode, "saving");
  assert.equal(p.spendMode, "saving");
  assert.equal(p.findsComfort, "attainable");
  assert.equal(p.premiumThreshold, 150);
  assert.equal(p.diningNormalMin, 20);
  assert.deepEqual(p.preferredPlanWindows, ["weekend"]);
  assert.equal(p.sundayReset, false);
});

check("normalize clamps invalid enums back to defaults", () => {
  const p = normalizeOperatingPreferences({
    operating_mode: "nonsense",
    spend_mode: "yolo",
    finds_comfort: "champagne",
    aspirational_frequency: "always",
  });
  assert.equal(p.operatingMode, "balanced");
  assert.equal(p.spendMode, "balanced");
  assert.equal(p.findsComfort, "premium_realistic");
  assert.equal(p.aspirationalFrequency, "rare_unless_requested");
});

check("normalize on garbage returns a clone of defaults", () => {
  assert.deepEqual(normalizeOperatingPreferences(null), DEFAULT_OPERATING_PREFERENCES);
  assert.deepEqual(normalizeOperatingPreferences("x"), DEFAULT_OPERATING_PREFERENCES);
});

// ── formatIncomeRange ─────────────────────────────────────────────────────────
check("formatIncomeRange humanizes around_100k", () => {
  assert.equal(formatIncomeRange("around_100k"), "around $100k");
  assert.equal(formatIncomeRange(null), null);
  assert.equal(comfortLabel("premium_realistic"), "premium-realistic");
});

// ── spendContextForResearcher ─────────────────────────────────────────────────
check("spend block carries income, threshold, dining, and posture", () => {
  const block = spendContextForResearcher(DEFAULT_OPERATING_PREFERENCES);
  assert.ok(block.includes("OWNER MONEY CONTEXT"));
  assert.ok(block.includes("$100k"));
  assert.ok(block.includes("$300"));
  assert.ok(block.includes("$30-75"));
  assert.ok(/premium-realistic/.test(block));
});

check("saving mode tightens the spend block", () => {
  const block = spendContextForResearcher(
    normalizeOperatingPreferences({ operating_mode: "saving", spend_mode: "saving" }),
  );
  assert.ok(/ACTIVE MODE: Saving/i.test(block));
});

// ── reads ─────────────────────────────────────────────────────────────────────
check("operatingSummaryLine names the mode + spend posture", () => {
  const line = operatingSummaryLine(DEFAULT_OPERATING_PREFERENCES);
  assert.ok(line.includes("Balanced"));
  assert.ok(/spend balanced/.test(line));
});

check("operatingFitBlock includes mode meaning + rhythm guardrails", () => {
  const block = operatingFitBlock(DEFAULT_OPERATING_PREFERENCES);
  assert.ok(/Operating mode: Balanced/.test(block));
  assert.ok(/Sundays are a reset day/.test(block));
  assert.ok(/low-friction/.test(block));
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll operating-preferences checks passed.");
