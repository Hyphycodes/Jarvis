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
│  2.  Radar Autopilot          ← health check + campaign choice    │
│  3.  Source Graph             ← due source checks + cadence       │
│  4.  Candidate Inbox          ← raw/evaluation discovery layer    │
│  5.  Living Library           ← durable places/events/sources     │
│  6.  Taste Seed Importer      ← owner context into real tables     │
│  7.  buildInterestGraph()     ← seed + memory + behavior nudges  │
│  8.  runTasteStrategist()     ← exploration lanes (Claude)       │
│  9.  buildScoutMissions()     ← lanes → typed Scout missions     │
│ 10.  gatherFromCuriosityPlan()← real source calls, capped        │
│ 11.  ingestCandidates()       ← upsert into surfaced_items       │
│ 12.  runRadarCuration()       ← score, curator, critic, briefing │
│ 13.  Intelligence Core        ← signal, truth, diversity, plan    │
│ 14.  briefing/front-room gate ← keep weak output out of Radar     │
│ 15.  IntelligenceTrace        ← compact durable decision trace    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

The pipeline runs ONLY from owner actions and ambient endpoints such as
`POST /api/radar/refresh` and `POST /api/intelligence/run`. Page loads never
trigger discovery or external source calls.

## Radar Autopilot

`lib/radar/autopilot.ts` is the background research-desk coordinator. It reads:

- Active Radar count and front-room health
- Holding depth
- Candidate Inbox depth
- Living Library depth and refresh need
- Source Graph depth and sources due for recheck
- event freshness
- Today, Circle, North, and day context from FounderContextPacket

It then chooses maintenance, Bootstrap Mode, or Foundation Sprint Mode.
Maintenance runs one operation:
refill, Holding build, Candidate Inbox build, Library build/refresh, event
pulse, Source Graph recheck/expansion, weekend / after-work / Circle / North
campaign, stale cleanup, promotion review, or no-op. Bootstrap Mode runs when
the intelligence bank is thin and can execute a bounded stack in one pass:
source building, Library build, Event Pulse build, Candidate Inbox build,
source recheck/expansion, Holding build, and final conservative promotion
review.

`/api/radar/autopilot` is cron-protected and scheduled every two hours.
`/api/radar/autopilot?mode=bootstrap` forces the foundation-builder path for
owner/cron operations. `/api/radar/autopilot?mode=foundation_sprint` is the
persistent foundation route and is scheduled every 15 minutes. It no-ops quickly
when Foundation Sprint is off or the core targets are healthy.

Foundation Sprint is a mission queue, not one giant search. Settings store an
enable flag, aggressive targets, start/completion timestamps, and a mission
cursor. Each run selects a bounded batch from missions such as taste-seed
verification, source building, events windows, neighborhood/drift lanes,
candidate evaluation, Library conversion, source recheck, and Holding promotion
review. The next cron continues from the cursor, so the app does not need to
stay open.

Manual `/api/radar/refresh` now runs an autopilot review/override first, then
keeps the existing refill response shape for UI compatibility. If the Library,
Candidate Inbox, Source Graph, or Tier A/B inventory is thin, manual refresh
enters Bootstrap Mode rather than silently returning an empty-looking refresh.

Run state is recorded in `radar_autopilot_runs`, and short operator messages go
to `radar_autopilot_activity`. `/settings/library` uses those rows plus
`radar_autopilot_settings` to show whether Jarvis is running, idle, paused,
blocked by missing providers, partial-success, failed, healthy, in Foundation
Sprint, or in need of bootstrap. Pause blocks scheduled maintenance cron;
Foundation Sprint can be started, paused, resumed, or run for the next mission
from the control room. Stop is cooperative and means stop after the current
major operation.

Failures are partial whenever useful work happened. A mission can create
candidates or sources, fail during conversion, and still finish as
`partial_success` with row counts and error detail. Missing optional providers
only block missions that need them.

Candidate-to-Library conversion is explicit. `radar_candidate_inbox` can grow
large during aggressive discovery, but rows must be evaluated and converted into
`places_library`, `current_events`, or `intelligence_sources` before they can
inform Holding or Radar. Ambiguous event dates remain contextual; exact event
rows require exact provider-backed times.

## Taste Seed Importer

`lib/tasteSeed/parser.ts` parses owner-provided markdown with these sections:
People / Circle, Upcoming Events, Places, Taste Signals, Discovery Sources, and
Notes for Jarvis. `lib/tasteSeed/importer.ts` keeps dry-run parsing separate
from commit writes.

Commit mode routes data into existing tables:

- Circle people into `circle_people`
- ambiguous upcoming planning windows into `circle_updates`
- owner-known places into `places_library`
- positive and negative taste priors into `taste_signals`
- negative filters into `founder_profile.avoid_keywords`
- discovery sources into `intelligence_sources`
- operating notes into `memory_items`
- import audit into `intelligence_traces`

Every row carries `taste_seed_import` provenance where the destination table
supports source or metadata. The importer is idempotent by exact person name,
place slug, source key, taste trait, memory content, and Circle update title.
Imported people are written to the same `circle_people` data source that the
Circle page reads; tests assert that owner-provided names appear through that
loader after commit.

The seed is not a recommendation list. Names build the Library; reasons build
the brain. Imported places are context anchors and similarity seeds only. They
do not automatically become Candidate Inbox, Holding, or Active Radar rows.

## Intelligence Core (Sprint 7)

`lib/intelligence` is the shared entrypoint for the Radar curation engine:

- Context pass: wraps `buildBrainContext()` and carries Weekly Rhythm, memory,
  recent actions, active Radar inventory, plans, weather, and founder taste.
- Signal pass: profiles category, vibe, purpose label, effort, spend, source
  trust, evidence quality, and practical friction.
- Judgment pass: wraps the Decision Council and preserves the strict
  `radar | holding | discovered | archive` admission result.
- Taste pass: reads the Taste Constitution instead of literal keyword matches.
- Rhythm pass: uses the workday/evening/weekend cadence to protect focus.
- Truth pass: tracks known and missing details without inventing facts.
- Composition pass: produces UI-safe copy for cards, Today rows, and plan seeds.
- Plan readiness pass: prepares a truth-safe `planSeed` only for strong
  high-confidence items.

Radar uses this core to maintain a 5-item target and 10-item cap while still
returning fewer than 5 when the pool is not strong enough.

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

The prompt includes the founder's available Today and rhythm context from
`FounderContextPacket` / `BrainContextPacket`. It should use real plans,
calendar-like rows, Circle moments, weekly rhythm, and day context when present.
It should not assume a fixed commute, fixed city, or fixed evening pattern.

### Output validation

Strict Zod schema in `tasteStrategist.ts`. Bad Claude JSON → falls back to a deterministic seed-lane generator (no crash).

### Fallback when no Anthropic key

`deterministicLanes()` returns:
- 2 aligned lanes from top-weighted active interests
- 1 adjacent from the first aligned area's adjacency list
- 1 wildcard from any dormant interest

Lane source strategies come from the interest's `relatedSources` field.

## Mission-based Scout (`lib/brain/scoutMissions.ts`, `lib/brain/scout.ts`)

Pure code converts strategist lanes into Scout missions before source calls:

```ts
type ScoutMission = {
  id: string;
  lane: string;
  intent: string;
  destination: "radar" | "holding" | "discovered" | "north" | "library";
  queryIdeas: string[];
  sourceStrategy?: string[];
  domains?: string[];
  locationScope?: string;
  urgency?: string;
  effort?: string;
  spendingPosture?: string;
  confidence?: number;
  contextReason?: string;
};
```

### Mission rules

- Strategist-generated query ideas are primary.
- Static query pools and curated URLs are fallback/seed inputs only when
  strategist missions are insufficient.
- City-specific seeds are gated by profile/location context.
- Scout may skip quietly when there are no valid missions.
- Scout writes an `intelligence_traces` row with missions, source quality, and
  outcome when a run executes or is skipped for no missions.

## Curiosity Engine (`lib/brain/curiosity.ts`)

The Radar refresh path still uses the Curiosity Engine to turn strategist lanes
into typed source plans for `gatherFromCuriosityPlan()`. It remains pure code,
uses no Claude, and enforces source caps before external calls. This path and
Scout share the same principle: lanes first, static fallback only when needed.

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
2. **Static fallback / bootstrap seed** (`gatherRadarCandidates`) — only used when both the strategist returned zero lanes AND the curiosity engine produced no plan entries, or by Bootstrap Mode as a bounded provider-backed seed path for an empty intelligence bank.

`gatherLocalRadarLanes()` in `localRadar.ts` handles the dynamic web-research lanes — same Tavily-first/Brave-fallback logic as the static groups, with per-query domain hints.
It rejects obvious Instagram/social noise, hashtag/profile titles, directory
spam, coupon/near-me pages, stale results, generic listicles, and titles that
are mostly literal query echo.

All Sprint 2.1 caps remain in effect.

Bootstrap provider behavior is honest: Google Places can build place candidates,
Ticketmaster can build events, Tavily/Brave can seed web/source candidates, and
SerpAPI is reserved for explicit product/shopping lanes. If providers are not
configured, traces and route summaries report that instead of creating fake
rows. Tavily article results can still seed `intelligence_sources` and
`radar_candidate_inbox` source candidates even before extraction creates a
durable place.

## Behavior feedback (`lib/brain/interestFeedback.ts`)

Called from item-action server actions after save/pass/plan/complete/archive/restore.

- Matches the action to an interest area (parent-walking, keyword match).
- Returns **short-term deltas** (never persisted on their own).
- Returns **pattern hints** when the same status accumulates (`repeated_save`, `repeated_pass`, `completed_streak`, `dormant_revival`).

## Reasons and decision traces

`lib/brain/intelligenceReason.ts` is the shared "Why this?" payload. Radar,
Today, plans, Scout, and chat/voice actions can attach it without changing the
visual design.

`lib/brain/intelligenceTrace.ts` writes best-effort rows to
`intelligence_traces`. Traces should stay compact:

- relevant North priorities and matched pillars
- behavior that influenced save/pass/plan scoring
- Circle moments or memory/preferences that mattered
- candidates considered, selected, and rejected
- source quality, confidence, and final outcome

Trace writes are observability, not business-critical writes. A trace failure
must be logged and swallowed.
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

## Derived Move Generator

`lib/brain/moveGenerator.ts` contains cadence-derived move candidates, but
ambient runs keep them disabled by default. They only run when
`JARVIS_ENABLE_SYNTHETIC_MOVES=true` is explicitly set. Normal production
discovery should be mission/source driven and should not use hardcoded moves to
pad empty Radar or Today states.

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
