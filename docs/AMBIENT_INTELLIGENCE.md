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
- `POST /api/radar/refresh` (manual debug path, runs bounded Radar refill)
- `POST /api/radar/cleanup`

The code is cron-ready in shape, but automatic Vercel Cron should only be wired
after cadence and budget are monitored in production.

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
