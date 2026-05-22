# Jarvis Brain — Interest Graph, Strategist, Curiosity Engine

> Built in Sprint 2.2. Complements `docs/RADAR.md` (front-room/back-room
> inventory model) by adding the layer that decides what to be curious
> about BEFORE any source is called.

## Layered architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Brain pipeline                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1.  buildBrainContext()      ← founder, memory, signals, weather│
│  2.  buildInterestGraph()     ← seed + memory + behavior nudges  │
│  3.  runTasteStrategist()     ← exploration lanes (Claude)       │
│  4.  buildCuriosityPlan()     ← lanes → typed source plan (code) │
│  5.  gatherFromCuriosityPlan()← real source calls, capped        │
│  6.  ingestCandidates()       ← upsert into surfaced_items       │
│  7.  runRadarCuration()       ← score, curator, critic, briefing │
│  8.  briefing quality gate    ← keep weak output out of Radar    │
│  9.  enforceActiveRadarCap()  ← rotate excess to Holding         │
│ 10.  pruneStaleHolding()      ← archive aged Holding             │
│ 11.  logDecisionRun()         ← strategy snapshot stored         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

The pipeline runs ONLY from `POST /api/radar/refresh`. Page loads never trigger any of it.

## Interest Graph (`lib/brain/interests.ts`, `lib/brain/interestSeed.ts`, `lib/brain/interestGraph.ts`)

Jarvis's model of the founder's world. Twelve top-level areas with ~5 subinterests each, plus adjacency edges that drive "stretch" exploration.

### Node shape

```ts
type Interest = {
  id: string;
  label: string;
  parentId?: string;        // present on subinterests
  status: "active" | "dormant" | "emerging" | "avoid" | "seasonal";
  weight: number;           // 0..1
  confidence: number;       // 0..1
  subinterests: string[];
  adjacent: string[];       // sibling areas for stretch suggestions
  relatedSources: SourceName[];
  preferredDestinations: ("radar" | "holding" | "discovered" | "north")[];
  spendingPosture: "free" | "low" | "paid" | "high";
  effortLevel: "low" | "medium" | "high";
  seasonality?: "year_round" | "spring" | "summer" | "fall" | "winter" | "holidays";
  examples: string[];
  avoidNotes: string[];
  lastExploredAt?: string;
  explorationCount: number;
  belief: "seed_profile" | "memory" | "behavior" | "manual" | "inferred";
};
```

### Top-level seed areas

1. Dining & food
2. Culture & nightlife (with restraint)
3. Style & menswear
4. Watches
5. Real estate & wealth systems
6. Land, homestead & building
7. Creative craft
8. Travel — Italy & rural life
9. Health & discipline
10. Faith, meaning & community
11. Technology, AI & tools
12. Outdoors & nature

### No new tables

The graph is built per-refresh from:
- `interestSeed.ts` (static starting point)
- `memory_items` (stable inferences from accepted memory proposals)
- `behavior_signals` + `surfaced_items` recent actions (short-term nudges)

Snapshots are stored in `brain_decision_runs.raw_output.strategy.graph_summary` for audit.

## Taste Strategist (`lib/brain/tasteStrategist.ts`)

The first Claude role in the pipeline. Reads the Interest Graph + context and returns **exploration lanes**:

```ts
type ExplorationLane = {
  id: string;
  title: string;
  mode: "aligned" | "adjacent" | "wildcard";
  interest_area: string;
  subinterests: string[];
  why_it_fits: string;
  why_now: string;
  source_strategy: string[];
  query_ideas: string[];          // 1..6, specific
  preferred_domains?: string[];
  excluded_domains?: string[];
  suggested_destination: "radar" | "holding" | "discovered" | "north";
  urgency: "low" | "medium" | "high";
  effort_level: "low" | "medium" | "high";
  spending_posture: "free" | "low" | "paid" | "high";
  confidence: number;             // 0..1
};
```

### Lane mix (enforced in code, not just prompt)

- 2–3 **aligned** (direct extensions of active interests)
- 1–2 **adjacent** (stretch interests via adjacency edges)
- 0–1 **wildcard** (genuine surprise that still respects taste)
- Total max **6** lanes per refresh
- **0 lanes is valid** when nothing useful should be explored

### Schedule awareness

The prompt includes the founder's actual schedule:
- Leaves for work around 06:20
- Leaves Schaumburg around 15:30
- Home by 16:30
- Weeknights (Mon–Thu) = limited energy

Weeknight lanes must be practical or lightweight unless exceptional.

### Output validation

Strict Zod schema in `tasteStrategist.ts`. Bad Claude JSON → falls back to a deterministic seed-lane generator (no crash).

### Fallback when no Anthropic key

`deterministicLanes()` returns:
- 2 aligned lanes from top-weighted active interests
- 1 adjacent from the first aligned area's adjacency list
- 1 wildcard from any dormant interest

Lane source strategies come from the interest's `relatedSources` field.

## Curiosity Engine (`lib/brain/curiosity.ts`)

Pure code. No Claude. No external calls. Converts strategist lanes into a typed source plan:

```ts
type SourcePlanEntry = {
  lane_id: string;
  source: "localRadar" | "googlePlaces" | "ticketmaster" | "tavily" | "brave" | "serpapi" | "mlb" | "none";
  queries: string[];           // ≤ 3 per lane
  max_results: number;
  destination_bias: "radar" | "holding" | "discovered" | "north";
  preferred_domains?: string[];
  excluded_domains?: string[];
  reason: string;
};
```

### Code-enforced rules

- **SerpAPI gate**: only when `isProductLane()` matches AND lane confidence ≥ 0.7.
- **Brave gate**: never if Tavily is configured (Brave is the fallback, never both).
- **localRadar cap**: at most `LOCAL_RADAR_MAX_QUERIES_PER_REFRESH` (6) lanes routed to LocalRadar.
- **Lane rotation**: lanes whose id appeared in the last 3 runs get their query count cut to 1 unless urgency is "high".
- **Global candidate cap**: `MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH` (60). Queries are trimmed mid-plan if the cap would be exceeded.
- **Skip-to-Holding**: lanes destined for `holding` or `north` with low urgency and confidence < 0.6 get `source: "none"` — they become Holding/discovered ideas without an API call.
- **Query translation**: stylistic lane language is translated before source
  calls. For example, "rugged masculine" becomes useful searches such as
  "Chicago heritage menswear", "Chicago leather goods boutique", and "Chicago
  vintage menswear market" instead of literal phrase searches.

## Briefing Editor (`lib/brain/briefingEditor.ts`)

Runs after Curator and Critic and before code gates. The editor converts raw
candidate/source/curation data into `payload.briefing`, validates the JSON, and
falls back deterministically when Anthropic is unavailable.

The quality gate uses briefing fields to decide final placement:

- Active Radar: high enough confidence, clear `one_line`, clear `jarvis_take`,
  no major quality flags, and next action not `pass`/`ignore`.
- Holding: medium confidence, useful but non-urgent, good signal with weak
  evidence, or needs research.
- Discovered/Archive: low confidence, generic, social noise, SEO junk, too
  literal, bad source, or not actionable.

See [`docs/BRIEFINGS.md`](./BRIEFINGS.md) for the payload shape and display
policy.

## Plan Generator (`lib/brain/planGenerator.ts`)

Runs only from explicit owner action: `POST /api/items/[id]/generate-plan`.
It never runs on Radar, Today, item, or plan page load.

Inputs include the source `IndexedItem`, the cleaned Consideration Brief view,
BrainContext, Interest Graph summary, recent behavior, memory, schedule hints,
and weather only when already present in BrainContext. The generator uses
Anthropic when available and falls back to a deterministic draft plan when the
key is missing or JSON validation fails.

The generator validates strict JSON in `lib/brain/planTypes.ts` and stores
clean plan metadata in `plans.key_stats`, including `primary_move`,
`best_window`, source item id, timing, effort/spend posture, confidence,
cautions, and grab list. The model never writes the database directly; server
actions persist the plan, sections, timeline rows, source item payload link,
and behavior signal.

Plan sections adapt by item type:

- places/dining get timing, route, atmosphere, cost, and optional detours
- events get timing, ticket/entry check, route, move, and after
- outdoors/activity ideas get prep, effort/recovery, gear, and weather notes
  only when weather context exists
- product/style plans get fit check, buy/hold/compare, cost, alternatives, and
  verification
- article/idea/land/creative plans get research path, next questions, leverage
  angle, what to watch, and first small move

## Source layer (`lib/sources/gather.ts`, `lib/sources/localRadar.ts`)

Two paths:

1. **Lane-driven** (`gatherFromCuriosityPlan`) — primary. Each plan entry triggers the right adapter with the right queries.
2. **Static fallback** (`gatherRadarCandidates`) — only used when both the strategist returned zero lanes AND the curiosity engine produced no plan entries.

`gatherLocalRadarLanes()` in `localRadar.ts` handles the dynamic web-research lanes — same Tavily-first/Brave-fallback logic as the static groups, with per-query domain hints.
It rejects obvious Instagram/social noise, hashtag/profile titles, directory
spam, coupon/near-me pages, stale results, generic listicles, and titles that
are mostly literal query echo.

All Sprint 2.1 caps remain in effect.

## Behavior feedback (`lib/brain/interestFeedback.ts`)

Called from item-action server actions after save/pass/plan/complete/archive/restore.

- Matches the action to an interest area (parent-walking, keyword match).
- Returns **short-term deltas** (never persisted on their own).
- Returns **pattern hints** when the same status accumulates (`repeated_save`, `repeated_pass`, `completed_streak`, `dormant_revival`).
- Strong patterns can be promoted to permanent memory via the existing `memory_update_proposals` flow — never directly written to `memory_items`.

## Decision logging

`brain_decision_runs.raw_output` now stores both the final decision AND the strategy snapshot:

```jsonc
{
  "decision": { /* BrainDecision */ },
  "strategy": {
    "graph_summary": { "top_level": [...], "origin": {...} },
    "lanes": [ExplorationLane, ...],
    "source_plan": [SourcePlanEntry, ...],
    "skipped_lane_ids": ["lane:wildcard:watches", ...],
    "strategist_fallback_used": false,
    "strategist_reason": null
  }
}
```

`/account/intelligence` reads the latest run and displays the "Last exploration" panel (lane titles, modes, destinations).

## What Jarvis still won't do

(All Sprint 2.1 invariants + new ones from Sprint 2.2)

- No external calls on page load.
- No SerpAPI unless the lane is explicitly product/style/watch/gear AND confidence ≥ 0.7.
- No Brave when Tavily is configured.
- No more than 6 strategist lanes per refresh.
- No more than 60 total candidates per refresh.
- No more than 3 queries per lane.
- No AI direct database mutation — Claude returns decisions, code applies them.
- No automatic Radar promotion — items only reach Active Radar through the Curator + Critic + gates.
- Empty selected[] and empty lanes[] are valid answers.

## Ambient Runs

The ambient intelligence layer wraps the existing brain instead of replacing it.
Run types are `daily_maintenance`, `radar_discovery`, `weekend_preview`,
`holding_review`, and `north_reflection`. Runs are owner-triggered today and
cron-ready later. They never execute from page load. Metadata lives in
`brain_decision_runs.raw_output.ambient`; estimated cost lives in
`brain_decision_runs.raw_output.budget`.

## Move Generator

Synthetic moves are low-noise recommendations created from Weekly Rhythm, time
of day, current inventory, and durable interests. They use `source = ai`, a
stable `synthetic_move:*` source id, and a normal `payload.briefing`, so Radar
and the Consideration Brief render them like any other surfaced item.

## Life Cadence

`lib/brain/lifeCadence.ts` infers lightweight cadence from recent actions and
signals. It does not add schema. It helps the Move Generator notice when lanes
like basketball, gym recovery, gun range, golf, Spanish/music study, DJ crates,
land review, woodworking, creative production, social rooms, or outdoor reset
have been quiet long enough to suggest a useful next move.

Cadence copy should not guilt the owner. It should frame a useful window: "keeps
the skill lane warm", "small rep that compounds", or "good window to get a
session in."

North also uses the same helper as a momentum map. The seeded lanes are Body /
Performance, Skill / Competence, Creative / Hyphy, Ownership / Land / Wealth,
Taste / Culture, Relationships / Social, and Peace / Discipline. They show
status, cadence target, last touch when inferable, next useful rep, and why the
lane matters. This is not a streak or habit tracker.

## Taste Constitution

`lib/brain/tasteConstitution.ts` is the durable internal "what belongs in this
world" layer. It is not a keyword list. It encodes:

- identity frame: Chicago-based owner/creator/operator building Hyphy
- core lanes: health, skill, taste, ownership, creative, business, social, peace
- taste principles: refined, masculine, cinematic, grounded, quiet luxury,
  rugged but elegant, timeless, real, calm, useful
- positive signals: low-lit rooms, cigar/jazz/hotel-bar energy, menswear,
  watches, land, horseback/golf/basketball/gun range, woodworking, Spanish,
  DJ/music/camera, relationship-building rooms
- negative signals: fake luxury, influencer noise, generic nightlife, literal
  query matches, random social snippets, SEO junk, closed events, weak source
  leads, corny masculine content
- spend posture: free/low-cost is welcome; paid and expensive moves need
  stronger justification
- attention posture: recommendations must earn interruption

The exported helpers are `getTasteConstitution()`,
`scoreAgainstTasteConstitution()`, `getAntiLaneFlags()`, and
`getPurposeLabel()`.

## Decision Council

`lib/brain/decisionCouncil.ts` turns curation into an admission decision. The
council is deterministic/code-first and uses existing AI-generated briefing
copy only as input. It does not add new LLM calls.

Roles:

- Scout: source quality, entity clarity, freshness, trust, expired/closed/noise
- Operator: fit with Weekly Rhythm, timing, cost, effort, workday/weekend
- Taste Strategist: Taste Constitution fit and anti-lanes
- Growth Coach: health, skill, ownership, creative, relationships, business,
  discipline, peace
- Critic: weak evidence, generic copy, literal query junk, bad title, stale,
  not actionable
- Briefing Editor output: action title, purpose label, one-line, best move, and
  display depth

The output is `RadarDecision`:

- `admission`: `radar`, `holding`, `discovered`, or `archive`
- `confidence`
- `purpose_label`
- `move_title`
- `one_line`
- `best_move`
- `display_depth`
- positive and negative signals
- per-role council scores

`lib/intelligence/radarFrontRoom.ts` adapts this decision into the hard Active
Radar gate. Active Radar only admits `admission="radar"`.
