/* Quick correctness checks for the living-5 engine + composite blend.
 * Run: pnpm exec tsx scripts/living-five.test.ts
 */
import { planLivingFive, type LivingFiveMember } from "@/lib/radar/livingFive";
import {
  blendRadarComposite,
  deriveCompositeDimensions,
  flowFromMiles,
  RADAR_COMPOSITE_WEIGHTS,
} from "@/lib/scoring/radarComposite";

let failures = 0;
function assert(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

function m(id: string, category: LivingFiveMember["category"], composite: number, extra: Partial<LivingFiveMember> = {}): LivingFiveMember {
  return { id, category, composite, eligible: true, ...extra };
}

console.log("composite weights sum to 1.0");
const sum = Object.values(RADAR_COMPOSITE_WEIGHTS).reduce((a, b) => a + b, 0);
assert("weights sum ~= 1", Math.abs(sum - 1) < 1e-9);
assert("taste is dominant", RADAR_COMPOSITE_WEIGHTS.taste >= 0.4 && RADAR_COMPOSITE_WEIGHTS.taste > RADAR_COMPOSITE_WEIGHTS.timeliness);

console.log("blend basics");
assert("all-1 → 1", blendRadarComposite({ taste: 1, timeliness: 1, energy: 1, flow: 1, money: 1, benefit: 1 }) === 1);
assert("all-0 → 0", blendRadarComposite({ taste: 0, timeliness: 0, energy: 0, flow: 0, money: 0, benefit: 0 }) === 0);
const tasteHeavy = blendRadarComposite({ taste: 1, timeliness: 0, energy: 0, flow: 0, money: 0, benefit: 0 });
assert("taste-only equals taste weight", Math.abs(tasteHeavy - RADAR_COMPOSITE_WEIGHTS.taste) < 1e-9);

console.log("flow proximity");
assert("closer scores higher", flowFromMiles(1) > flowFromMiles(10) && flowFromMiles(10) > flowFromMiles(50));
assert("unknown miles is neutral", flowFromMiles(null) === 0.5);

console.log("derive dimensions");
const dims = deriveCompositeDimensions({ tasteFit: 0.8, timingFit: 0.6, energyCost: 0.7, moneyCost: 0.45, northAlignment: 0.5, milesFromUser: 1 });
assert("energy = 1 - cost", Math.abs(dims.energy - 0.3) < 1e-9);
assert("money peaks at worth-it spend", dims.money > 0.95);
assert("flow close = 1", dims.flow === 1);

console.log("living-5: fills empty category up to 5, reports gaps");
{
  const active: LivingFiveMember[] = [m("d1", "dining", 0.9), m("d2", "dining", 0.8)];
  const candidates: LivingFiveMember[] = [
    m("d3", "dining", 0.7), m("d4", "dining", 0.6), m("d5", "dining", 0.5), m("d6", "dining", 0.4),
    m("e1", "events", 0.7),
  ];
  const plan = planLivingFive({ active, candidates });
  const diningPromos = plan.promotions.filter((p) => p.category === "dining").map((p) => p.id);
  assert("dining fills to 5 (3 promos)", diningPromos.length === 3 && diningPromos.includes("d3") && diningPromos.includes("d5") && !diningPromos.includes("d6"));
  assert("events promotes its 1 candidate", plan.promotions.some((p) => p.id === "e1"));
  assert("dining no gap, events gap have=1", !plan.gaps.some((g) => g.category === "dining") && plan.gaps.some((g) => g.category === "events" && g.have === 1));
  assert("empty categories reported as gaps", plan.gaps.some((g) => g.category === "moves" && g.have === 0));
}

console.log("living-5: displacement only when strictly stronger by margin");
{
  const active: LivingFiveMember[] = [
    m("p1", "places", 0.9), m("p2", "places", 0.85), m("p3", "places", 0.8), m("p4", "places", 0.75), m("p5", "places", 0.6),
  ];
  const candidates: LivingFiveMember[] = [
    m("c-strong", "places", 0.7),   // beats weakest 0.6 by > margin → displaces
    m("c-weak", "places", 0.61),     // within margin of 0.6 → no displace
  ];
  const plan = planLivingFive({ active, candidates });
  assert("strong challenger displaces weakest", plan.displacements.some((d) => d.promote === "c-strong" && d.demote === "p5"));
  assert("weak challenger does not displace", !plan.displacements.some((d) => d.promote === "c-weak"));
  assert("no promotions when full", plan.promotions.filter((p) => p.category === "places").length === 0);
}

console.log("living-5: never pads with ineligible, respects maxChanges");
{
  const active: LivingFiveMember[] = [m("d1", "dining", 0.9)];
  const candidates: LivingFiveMember[] = [
    m("x1", "dining", 0.8, { eligible: false }),
    m("x2", "dining", 0.7, { eligible: false }),
    m("ok", "dining", 0.6),
  ];
  const plan = planLivingFive({ active, candidates });
  assert("ineligible never promoted", !plan.promotions.some((p) => p.id === "x1" || p.id === "x2"));
  assert("only eligible promoted", plan.promotions.some((p) => p.id === "ok"));
  assert("dining still a gap (only 2 real)", plan.gaps.some((g) => g.category === "dining" && g.have === 2));

  const capped = planLivingFive({ active: [], candidates: [m("a", "moves", 0.9), m("b", "moves", 0.8), m("c", "moves", 0.7)], maxChanges: 2 });
  assert("maxChanges caps total promotions", capped.promotions.length === 2);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
