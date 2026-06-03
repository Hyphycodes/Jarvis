# Ambient Intelligence

Ambient Intelligence is the controlled background-thinking layer for Jarvis. It
does not run on page load and it does not create an endless feed. Owner-triggered
routes use the same brain pipeline as manual Radar refresh, but add run type,
budget, source quality, cleanup, and trace metadata.

## Run Types

- `daily_maintenance`: cheap stale-item, Today promotion, and Radar cleanup pass.
- `radar_discovery`: heavier discovery pass for source-backed candidates.
- `weekend_preview`: weekend-oriented discovery and Holding ideas.
- `holding_review`: re-evaluates Holding and cleans Active Radar without broad source calls.
- `north_reflection`: low-frequency long-term ideas, usually Holding.

Run metadata is stored in `brain_decision_runs.raw_output.ambient`. No schema
migration is required.

## Cost Governor

The budget governor estimates cost rather than exact billing. Defaults are safe:

- `DAILY_INTELLIGENCE_BUDGET_USD=5`
- `INTELLIGENCE_TEST_MODE=false`
- `MAX_DAILY_INTELLIGENCE_RUNS`
- `MAX_CLAUDE_CALLS_PER_RUN`
- `MAX_SOURCE_CALLS_PER_RUN`
- `MAX_CANDIDATES_PER_RUN`
- `MAX_BRIEFINGS_PER_RUN`

Each run logs estimated calls, candidates, briefings, run cost, and remaining
budget into `brain_decision_runs.raw_output.budget`.

## Endpoints

- `POST /api/intelligence/run`
- `GET /api/radar/autopilot`
- `GET /api/radar/autopilot?mode=bootstrap`
- `POST /api/radar/autopilot` with `mode=bootstrap|owner_requested|manual_force`
- `POST /api/radar/autopilot/pause`
- `POST /api/radar/autopilot/resume`
- `POST /api/radar/autopilot/stop`
- `POST /api/library/import-taste-seed`
- `POST /api/radar/refresh` (manual debug path, runs bounded Radar refill)
- `POST /api/radar/cleanup`

Radar Autopilot is wired to Vercel Cron every two hours. It decides no-op vs
real work from inventory health, Source Graph cadence, Library depth, and
context windows before calling expensive discovery.

Bootstrap Mode is Autopilot's foundation builder. When Places, active events,
Source Graph, Candidate Inbox, or Tier A/B Library inventory is thin, Autopilot
can run a bounded stack in one pass: source building, Library build, Event Pulse
build, Candidate Inbox build, source recheck/expansion, Holding build, and a
final conservative promotion review. Manual Radar refresh uses this path when
the bank is empty, so the control room should report "building" or "blocked by
missing providers" instead of appearing dead.

Provider keys matter. Google Places builds places, Ticketmaster builds events,
and Tavily/Brave/SerpAPI build source and opportunity inventory. If no external
discovery provider is configured, bootstrap records a clear missing-provider
summary and creates no fake candidates.

Operational state is durable:

- `radar_autopilot_runs` records scheduled/bootstrap/manual runs, status,
  counts before/after, provider status, and summary.
- `radar_autopilot_activity` records short control-room messages.
- `radar_autopilot_settings` stores pause and stop-after-current-step flags.

Pause only blocks scheduled cron. Owner-requested runs can still be launched
from `/settings/library`. Stop is cooperative: the current serverless step is
allowed to finish, then Bootstrap checks the flag before starting the next major
operation.

## Taste Seed Import

The taste seed importer is not a discovery run and does not call external
providers. It ingests first-party owner markdown as structured context for the
ambient system:

- dry run returns parsed counts and warnings with no database writes
- commit mode writes Circle, Library, Source Graph, memory, taste signals, and
  negative filters with `taste_seed_import` provenance
- ambiguous dates remain planning context instead of fake exact events
- imported places are never promoted directly to Active Radar

After commit, ambient runs can use the resulting FounderContextPacket,
Source Graph rows, Library anchors, and negative filters to guide future
discovery. Radar still needs Curator, Critic, Decision Council, and front-room
admission before anything is shown.

## Radar Refill Contract

Manual refresh and post-action auto-refill both use the same board rule:

- target at least 5 strong Active Radar items when possible
- never exceed 10 active items
- cleanup weak/noisy active rows before adding
- preserve saved, planned, completed, and archived rows
- avoid recent Pass near-duplicates
- stop after bounded attempts
- return fewer than 5 rather than padding with weak filler

Post-response refill is triggered after Save, Pass, Archive, Plan, Move to
Holding, or Add to Upcoming only when the strong active board drops below the
target. It uses the existing ambient/source/candidate pipeline; page loads do
not trigger discovery.

## Quality Rules

Active Radar requires Decision Council admission. That means a clean action
title, purpose label, useful evidence, no major
quality flags, and enough confidence to be decision-ready. Holding is for good
signal with weak timing, thin evidence, or higher effort. Archive/discovered is
for noisy, literal, expired, duplicated, low-trust, fake-luxury, corny,
hype-noise, or unclear candidates.

`evaluateActiveRadarItem()` is the hard front-room gate. It blocks weak evidence,
social noise, raw comments, literal query echoes, closed/expired events,
misclassification, unclear titles, source-lead-only rows, and no-current-value
briefs from Active Radar.

`lib/brain/tasteConstitution.ts` and `lib/brain/decisionCouncil.ts` are the
admission layer. The constitution encodes what belongs in the owner’s world; the
council scores Scout, Operator, Taste, Growth, and Critic roles before writing
or rendering the item.
