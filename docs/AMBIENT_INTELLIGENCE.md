# Ambient Intelligence

Ambient Intelligence is the controlled background-thinking layer for Jarvis. It
does not run on page load and it does not create an endless feed. Owner-triggered
routes use the same brain pipeline as manual Radar refresh, but add run type,
budget, source quality, cleanup, and synthetic move metadata.

## Run Types

- `daily_maintenance`: cheap stale-item, Today promotion, and Radar cleanup pass.
- `radar_discovery`: heavier discovery pass for candidates and synthetic moves.
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
- `POST /api/radar/refresh` (legacy/manual debug path, delegates to Radar Discovery)
- `POST /api/radar/cleanup`

The code is cron-ready in shape, but automatic Vercel Cron should only be wired
after cadence and budget are monitored in production.

## Quality Rules

Active Radar requires a clean action title, useful evidence or strong synthetic
context, no major quality flags, and enough confidence to be decision-ready.
Holding is for good signal with weak timing, thin evidence, or higher effort.
Archive/discovered is for noisy, literal, expired, duplicated, low-trust, or
unclear candidates.
