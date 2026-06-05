/* Correctness checks for the six-category-agent pure helpers.
 * Run: pnpm exec tsx --tsconfig tsconfig.scripts.json scripts/category-agents.test.ts
 */
import {
  buildWeekContext,
  buildAgentTasteBlock,
  normalizeAgentOutput,
  orderForInbox,
  CATEGORY_AGENT_BRIEFS,
  type AgentTaste,
  type CategoryAgentOutput,
  type SynthesisResult,
} from "@/lib/brain/categoryAgents";
import { RADAR_CATEGORIES } from "@/lib/radar/category";

let failures = 0;
function assert(label: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

console.log("agent briefs");
assert("one brief per category", RADAR_CATEGORIES.every((c) => CATEGORY_AGENT_BRIEFS[c]?.length > 50));
assert("style brief is product-facing", /product|buyer|drop/i.test(CATEGORY_AGENT_BRIEFS.style));
assert("moves brief allows rest weeks", /rest|nothing_this_week/i.test(CATEGORY_AGENT_BRIEFS.moves));

console.log("buildWeekContext");
{
  const wc = buildWeekContext(new Date("2026-06-05T14:00:00"), "Chicago");
  assert("afternoon at 14:00", wc.timeOfDay === "afternoon");
  assert("city + year", wc.city === "Chicago" && wc.year === 2026);
  assert("day name present", typeof wc.dayName === "string" && wc.dayName.length > 0);
}

console.log("buildAgentTasteBlock injects dynamic taste");
{
  const taste: AgentTaste = {
    city: "Chicago",
    vibeKeywords: ["cinematic", "warm"],
    avoidKeywords: ["loud"],
    dealbreakers: ["chain restaurants"],
    pinnedPrinciples: ["one strong rec over a list"],
    memories: [{ content: "loves natural wine", kind: "preference" }],
    northTags: ["Taste", "Ownership"],
  };
  const block = buildAgentTasteBlock(taste);
  assert("includes avoid", block.includes("loud"));
  assert("includes dealbreaker", block.includes("chain restaurants"));
  assert("includes memory", block.includes("natural wine"));
  assert("includes north", block.includes("Ownership"));
  assert("not hardcoded — empty taste yields minimal block", buildAgentTasteBlock({ city: "X", vibeKeywords: [], avoidKeywords: [], dealbreakers: [], pinnedPrinciples: [], memories: [], northTags: [] }).includes("Home base: X"));
}

console.log("normalizeAgentOutput");
{
  const ok = normalizeAgentOutput(
    { candidates: [{ name: "Kumiko", relevance_brief: "natural wine, quiet room" }, { name: "" }, { junk: true }], nothing_this_week: false, gap: false },
    "dining",
  );
  assert("keeps valid candidate only", ok.candidates.length === 1 && ok.candidates[0].name === "Kumiko");
  assert("category tagged", ok.category === "dining");

  const nothing = normalizeAgentOutput({ nothing_this_week: true, reason: "rest week", candidates: [{ name: "X", relevance_brief: "y" }] }, "moves");
  assert("nothing_this_week clears candidates (no padding)", nothing.nothing_this_week && nothing.candidates.length === 0);

  const gappy = normalizeAgentOutput({ candidates: [{ name: "A", relevance_brief: "b" }] }, "events");
  assert("gap inferred when <5 and unspecified", gappy.gap === true);
}

console.log("orderForInbox respects synthesis ranking");
{
  const outputs: CategoryAgentOutput[] = [
    { category: "dining", candidates: [{ name: "A", relevance_brief: "x" }, { name: "B", relevance_brief: "y" }], nothing_this_week: false, reason: "", gap: false },
    { category: "events", candidates: [{ name: "C", relevance_brief: "z" }], nothing_this_week: false, reason: "", gap: true },
    { category: "moves", candidates: [], nothing_this_week: true, reason: "rest", gap: true },
  ];
  const synthesis: SynthesisResult = {
    ranked: [
      { category: "events", name: "C", rank: 1, why_now: "window closing" },
      { category: "dining", name: "A", rank: 2, why_now: "new" },
    ],
    week_shape: "Quiet week; one strong event.",
    gaps: ["moves"],
  };
  const ordered = orderForInbox(outputs, synthesis);
  assert("synthesis lead is first", ordered[0].candidate.name === "C");
  assert("ranked before unranked", ordered[1].candidate.name === "A" && ordered[2].candidate.name === "B");
  assert("nothing_this_week contributes nothing", !ordered.some((o) => o.category === "moves"));
  assert("no dupes", new Set(ordered.map((o) => `${o.category}:${o.candidate.name}`)).size === ordered.length);
}

console.log("orderForInbox without synthesis falls back to agent order");
{
  const outputs: CategoryAgentOutput[] = [
    { category: "places", candidates: [{ name: "P1", relevance_brief: "x" }], nothing_this_week: false, reason: "", gap: true },
  ];
  const ordered = orderForInbox(outputs, null);
  assert("still emits candidate", ordered.length === 1 && ordered[0].candidate.name === "P1");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
