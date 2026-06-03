# AI orchestration

Jarvis intelligence starts from one shared context packet and ends by writing
real behavior back into that context. It should not create fake production
content to hide empty data.

## Current loop

```
FounderContextPacket
  -> Radar/Library Autopilot health check
  -> maintenance / Bootstrap / Foundation Sprint mission selection
  -> BrainContext + Interest Graph
  -> Taste Strategist missions
  -> Scout / Candidate Inbox / Researcher / Living Library
  -> Holding / Curator / Critic / Briefing Editor
  -> Decision Council + North alignment
  -> IntelligenceReason + IntelligenceTrace
  -> routed action
  -> behavior signals / source stats / memory proposals
  -> taste seed imports when owner provides first-party context
  -> future FounderContextPacket
```

## Context

`lib/context/founderContextPacket.ts` is the canonical user-context builder.
Routes and agents should use it, or a derived `BrainContextPacket`, instead of
rebuilding isolated context. The packet pulls real authenticated-user data:
North priorities, Radar saves/passes, Today plans and schedule, Circle moments,
memory, behavior signals, current time, and available location/weather context.

Empty context is valid. Production code should return an empty state, skipped
run, or "nothing worth showing" result rather than demo recommendations.

## Model and source calls

Model calls still go through `/lib/ai` helpers and structured Zod validation.
Agents may fall back deterministically when provider keys are missing, but the
fallback must be based on existing context and candidates.

Scout is mission-driven:

1. Taste Strategist emits exploration lanes and query ideas.
2. `lib/brain/scoutMissions.ts` turns lanes into `ScoutMission`s.
3. `lib/brain/scout.ts` executes those missions against real source adapters.
4. Static curated URLs and query pools are only gated seeds/fallbacks when
   strategist missions are insufficient.
5. Location-specific seeds, including Chicago sources, only run when the user
   profile/location context is compatible.

## Radar Autopilot

`lib/radar/autopilot.ts` is the background research-desk orchestrator. It does
not directly become a search function. It reads system health and chooses one
bounded maintenance operation:

- Active Radar refill when the front room is thin
- Holding build when Active is healthy but the back room is shallow
- Candidate Inbox build for raw discoveries
- Library build/refresh for durable places/events/sources
- Source Graph recheck/expansion
- weekend, after-work, Circle, or North campaigns
- no-op when the system is healthy enough

`/api/radar/autopilot` is cron-protected and runs every two hours. The cron can
run often because the orchestrator decides whether to do real work.

Manual `/api/radar/refresh` now runs an autopilot review/override path and then
keeps the old refill response shape for existing UI consumers.

The owner can also run `POST /api/radar/autopilot` with
`mode=bootstrap|foundation_sprint|owner_requested|manual_force`. Scheduled GET
calls require `CRON_SECRET`; owner POST calls use the normal authenticated owner
session.

## Bootstrap Mode

Bootstrap Mode is the first-run/foundation-builder path for an empty or thin
Library. It triggers from `/api/radar/autopilot?mode=bootstrap`, manual
owner-requested refresh when foundation targets are low, or normal cron when
health checks show the bank is thin.

Foundation targets:

- Places: 100
- Active events: 40
- Sources: 50
- Candidate Inbox: 150
- Tier A + B Library items: 25

One bootstrap pass is bounded to six operations and practical source/candidate
budgets. It can run source building, place Library build, Event Pulse build,
Candidate Inbox build, source recheck/expansion, Holding build, and a final
promotion review. Promotion remains conservative; raw Candidate Inbox and
Library rows do not become Active Radar automatically.

Bootstrap is provider-aware. It uses whichever real providers are configured:
Google Places for places, Ticketmaster for events, Tavily/Brave/SerpAPI for
web/source/opportunity discovery. If providers are missing or return nothing,
the summary says so. It must not create fake rows to make the control room look
alive.

## Foundation Sprint Mode

Foundation Sprint is the aggressive persistent version of Bootstrap. It is
enabled from `/settings/library` or `POST /api/radar/autopilot` with
`mode=foundation_sprint`. Vercel Cron calls
`/api/radar/autopilot?mode=foundation_sprint` every 15 minutes, but the route
no-ops quickly when the mode is off or core targets are healthy.

Aggressive targets:

- Places: 300
- Active events: 150
- Sources: 100
- Candidate Inbox: 500
- Tier A + B Library items: 75
- Recurring signals: 50
- Tastemakers: 50
- Organizations: 50
- Neighborhoods: 15

The sprint stores an enable flag, targets, timestamps, and mission cursor in
`radar_autopilot_settings`. Each cron run picks the next useful bounded mission
from taste-seed verification, source building, events windows,
neighborhood/drift lanes, active-social lanes, candidate evaluation, Library
conversion, source recheck, and Holding promotion review. This lets Jarvis keep
building while the app is closed.

This route is configured with `maxDuration = 300`, but it should not depend on
that. Autopilot creates an internal run budget: 35 seconds for normal runs and
45 seconds for Foundation Sprint. The runner checks the budget around provider
intake, source rechecks, and conversion batches. If the budget is nearly spent,
it saves the mission cursor, logs the activity, returns promptly, and lets the
next 15-minute cron continue.

Run state supports `partial_success`. A mission that creates candidates or
sources and then hits a conversion error or the internal time budget should
preserve the useful work, record the detail, and continue on the next scheduled
run. Missing optional providers only block the affected mission; they do not
stop configured providers from working.

## Library Layers

- **Candidate Inbox** (`radar_candidate_inbox`) is raw/evaluation inventory. It
  can be large and must never surface directly.
- **Living Library** uses existing `places_library`, `current_events`, and
  `tastemakers`, with quality tiers and source links added where useful.
- **Holding** is the curated back room for strong maybes.
- **Active Radar** is the small editorial board for what matters now.
- **Source Graph** (`intelligence_sources`) learns which publications, domains,
  venues, calendars, tastemakers, organizers, and search patterns produce
  quality for this user.

Source Graph scoring is intentionally simple: saves, plans, Library conversion,
trust, taste fit, novelty, and freshness upgrade sources; passes, duplicates,
and weak quality cool them down. Strong sources recheck in 6-24 hours, normal
sources in 24-72 hours, weak sources in 7+ days, and muted/retired sources stay
quiet.

Bootstrap source seeding also captures real provider result domains/articles as
`intelligence_sources` and `radar_candidate_inbox` source candidates. This lets
Jarvis learn where quality comes from even before an article yields a durable
place or event.

Candidate-to-Library conversion is the bridge between aggressive intake and
permanent memory. It reads a small batch of unevaluated Candidate Inbox rows,
classifies entity type, applies taste and negative-filter scoring, writes
durable places to `places_library`, writes events to `current_events` only when
exact provider dates exist, upserts sources to Source Graph, and marks weak or
ambiguous rows with reasons. It stops when the time budget is near and does not
write directly to Active Radar.

The owner can inspect the hidden layers from `/settings/library`. The page
shows latest Candidate Inbox rows, Source Graph rows, Places, Events,
Rejected/Muted rows, and Tier A/B/C slices. This is visibility into the research
desk, not a browsing product surface. Empty sections stay quiet; they are not
filled with fake examples.

Radar promotion diagnostics explain the final boundary. The diagnostic helper
reviews Candidate Inbox, Holding, Tier A/B Library places, and current events,
then returns source layer, score, eligibility, reason, blockers, and next step.
Raw Candidate Inbox rows are always blocked from direct promotion. Library
places can anchor taste and future timing but do not force Radar. Holding
remains the direct promotion source, and `isPromotableWhenUnderfilled()` plus
the Decision Council/front-room quality gates decide whether Active Radar
changes.

## Taste Seed Importer

`POST /api/library/import-taste-seed` and
`pnpm run import:taste-seed -- path/to/file.md` parse owner-provided markdown
into structured records. Dry run is the default and writes nothing. Commit mode
routes the parsed sections into existing systems:

- People / Circle -> `circle_people`
- Upcoming Events -> `circle_updates` when dates are contextual or ambiguous
- Places -> `places_library`
- Taste Signals and Negative Filters -> `taste_signals`
- Negative Filters -> `founder_profile.avoid_keywords` scoring penalties
- Discovery Sources -> `intelligence_sources`
- Notes for Jarvis -> `memory_items`
- Import log -> `intelligence_traces`

Do not hardcode seed names into prompts, components, fallback arrays, or static
queries. Imported names build the Library; imported reasons, notes, and filters
build the brain. Known places are anchors and similarity seeds, not automatic
Active Radar items.

Commit mode writes people to the same `circle_people` table the Circle page
reads. The Settings Library page reports visible seed-imported Circle people so
the owner can verify that taste seed context reached the relationship map.

## Library Control Room

`/settings/library` is the operational surface for this layer. It shows:

- current state: Running, Idle, Paused, Blocked, Partial Success, Foundation Sprint, Failed, Healthy, or Bootstrap needed
- provider availability and missing keys
- last run, last bootstrap/foundation run, current operation, current/next mission, and next scheduled estimate
- progress against bootstrap and Foundation Sprint targets
- last activity messages from `radar_autopilot_activity`
- compact previews of Candidate Inbox, Source Graph, Places, Events,
  Rejected/Muted rows, and Tier A/B/C Library inventory
- Radar promotion diagnostics that explain blockers and eligible Holding items
- owner controls to run Bootstrap, run Autopilot, pause, resume, or request
  stop after the current step
- Foundation Sprint controls to start, pause, resume, and run the next mission
- paste-based Taste Seed dry-run and commit controls

`partial_success` and "time budget reached" are progress states. They mean the
batch returned before timeout with saved work and the next scheduled run should
continue.

Run timestamps are stored in UTC and displayed in the control room as relative
time plus owner-local time, currently defaulting to America/Chicago. Error
details come from `radar_autopilot_runs.error_message` and activity metadata;
UI rendering should redact token-like values and show partial row counts.

The control room reads `radar_autopilot_runs`,
`radar_autopilot_activity`, and `radar_autopilot_settings`. These tables are
operational observability, not recommendation memory.

## Reasoning and traces

`lib/brain/intelligenceReason.ts` provides the reusable "Why this?" payload:
summary, context factors, North alignment, behavior/Circle/memory influence,
timing reason, source strength, and confidence.

`lib/brain/intelligenceTrace.ts` writes compact best-effort traces to
`intelligence_traces`. Store summaries, not huge raw context packets. Trace
writes must never block Radar, Today, chat/voice, plans, cron, or Scout.

## Writeback

Meaningful actions should write behavior signals and, when appropriate, memory
proposals. Save/pass/plan/complete/archive/cancel/chat commands should affect
future scoring through the next context packet and Source Graph source stats.

## Verification

Run:

```bash
pnpm run test:brain
pnpm run typecheck
pnpm run smoke
pnpm run build
git diff --check
```
