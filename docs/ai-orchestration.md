# AI orchestration

Jarvis intelligence starts from one shared context packet and ends by writing
real behavior back into that context. It should not create fake production
content to hide empty data.

## Current loop

```
FounderContextPacket
  -> Radar/Library Autopilot health check
  -> campaign selection
  -> BrainContext + Interest Graph
  -> Taste Strategist missions
  -> Scout / Candidate Inbox / Researcher / Living Library
  -> Holding / Curator / Critic / Briefing Editor
  -> Decision Council + North alignment
  -> IntelligenceReason + IntelligenceTrace
  -> routed action
  -> behavior signals / source stats / memory proposals
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
bounded operation:

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
`mode=bootstrap|owner_requested|manual_force`. Scheduled GET calls require
`CRON_SECRET`; owner POST calls use the normal authenticated owner session.

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

## Library Control Room

`/settings/library` is the operational surface for this layer. It shows:

- current state: Running, Idle, Paused, Blocked, Failed, Healthy, or Bootstrap needed
- provider availability and missing keys
- last run, last bootstrap run, current operation, and next scheduled estimate
- progress against bootstrap targets
- last activity messages from `radar_autopilot_activity`
- owner controls to run Bootstrap, run Autopilot, pause, resume, or request
  stop after the current step

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
