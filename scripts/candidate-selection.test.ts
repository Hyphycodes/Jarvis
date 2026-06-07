import assert from "node:assert/strict";
import {
  rowCategory,
  rowSource,
  selectFairly,
  type QueueEntry,
} from "../lib/radar/candidateSelection";
import type { RadarCandidateInboxRow } from "../lib/types/database";

let idCounter = 0;
function mkRow(opts: {
  category?: string;
  source?: string;
  entity_type?: string;
  title?: string;
  description?: string | null;
  raw?: Record<string, unknown>;
}): RadarCandidateInboxRow {
  idCounter += 1;
  const raw_payload: Record<string, unknown> = { ...(opts.raw ?? {}) };
  if (opts.category) raw_payload.category = opts.category;
  if (opts.source) raw_payload.source = opts.source;
  return {
    id: `id-${idCounter}`,
    user_id: "user-1",
    title: opts.title ?? `Item ${idCounter}`,
    description: opts.description ?? null,
    entity_type: opts.entity_type ?? "place",
    raw_payload,
    reason: null,
    score: null,
    url: null,
    image_url: null,
    status: "new",
  } as unknown as RadarCandidateInboxRow;
}

function countByCategory(entries: QueueEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    const key = e.category ?? "(none)";
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

// ── 1. Fairness: one heavy lane cannot consume the whole run ────────────────────
{
  const rows = [
    ...Array.from({ length: 10 }, () => mkRow({ category: "dining", source: "category_agent" })),
    ...Array.from({ length: 10 }, () => mkRow({ category: "culture", source: "category_agent" })),
    ...Array.from({ length: 2 }, () => mkRow({ category: "style", source: "category_agent" })),
  ];
  const selected = selectFairly(rows, 6);
  assert.equal(selected.length, 6, "respects the budget");
  const counts = countByCategory(selected);
  // round-robin across the 3 present lanes → 2 each, dining never dominates
  assert.equal(counts.dining, 2, "dining gets a fair slice, not the whole run");
  assert.equal(counts.culture, 2, "culture advances");
  assert.equal(counts.finds, 2, "style/finding advances under Finds");
}

// ── 2. User intent always leads and is never starved ────────────────────────────
{
  const rows = [
    ...Array.from({ length: 10 }, () => mkRow({ category: "dining", source: "category_agent" })),
    mkRow({ category: "places", source: "user_intent", title: "Pizz'Amici" }),
  ];
  const selected = selectFairly(rows, 3);
  assert.equal(selected.length, 3);
  assert.equal(selected[0].userIntent, true, "user intent is first in the queue");
  assert.equal(selected[0].row.title, "Pizz'Amici");
  assert.ok(
    selected.some((e) => e.userIntent && e.row.title === "Pizz'Amici"),
    "the asked-for item is always included",
  );
}

// ── 3. Budget cap with two lanes splits evenly ──────────────────────────────────
{
  const rows = [
    ...Array.from({ length: 10 }, () => mkRow({ category: "dining", source: "category_agent" })),
    ...Array.from({ length: 10 }, () => mkRow({ category: "moves", source: "category_agent" })),
  ];
  const selected = selectFairly(rows, 4);
  assert.equal(selected.length, 4);
  const counts = countByCategory(selected);
  assert.equal(counts.dining, 2);
  assert.equal(counts.moves, 2);
}

// ── 4. Category derivation ──────────────────────────────────────────────────────
{
  assert.equal(
    rowCategory(mkRow({ category: "culture", source: "category_agent" })),
    "culture",
    "explicit agent category wins",
  );
  assert.equal(
    rowCategory(mkRow({ entity_type: "event", title: "Some Show" })),
    "events",
    "event entity_type derives to events",
  );
  assert.equal(
    rowCategory(mkRow({ entity_type: "place", title: "Tiny omakase sushi counter" })),
    "dining",
    "keyword derivation routes sushi → dining",
  );
  assert.equal(
    rowCategory(mkRow({
      category: "moves",
      entity_type: "place",
      title: "Bronzeville Winery",
      raw: { place_type: "restaurant" },
    })),
    "dining",
    "restaurants/wineries do not become moves just because the agent said moves",
  );
  assert.equal(
    rowCategory(mkRow({
      category: "moves",
      entity_type: "place",
      title: "L7 Chicago hotel",
      raw: { place_type: "hotel", move_kind: "bookable" },
    })),
    "places",
    "hotels stay Places even with a bookable/timing hint",
  );
  assert.equal(
    rowCategory(mkRow({
      category: "places",
      entity_type: "place",
      title: "Lakefront Trail sunrise walk",
      raw: { sequence: "Start at Oak Street, walk south, finish near North Avenue." },
    })),
    "moves",
    "route/sequence behavior upgrades a trail into a Move",
  );
  assert.equal(
    rowCategory(mkRow({ entity_type: "source", title: "A newsletter" })),
    null,
    "sources are not a Radar category",
  );
}

// ── 5. rowSource reads raw_payload + reason ──────────────────────────────────────
{
  assert.equal(rowSource(mkRow({ source: "user_intent" })), "user_intent");
  assert.equal(rowSource(mkRow({ source: "category_agent" })), "category_agent");
  assert.equal(rowSource(mkRow({})), null);
}

console.log("✓ candidate-selection tests passed");
