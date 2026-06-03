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
- `GET /api/radar/autopilot?mode=foundation_sprint`
- `POST /api/radar/autopilot` with `mode=bootstrap|owner_requested|manual_force`
- `POST /api/radar/autopilot` with `mode=foundation_sprint`, plus optional `start`, `resume`, or `runNow`
- `POST /api/radar/autopilot/pause`
- `POST /api/radar/autopilot/resume`
- `POST /api/radar/autopilot/stop`
- `POST /api/library/import-taste-seed`
- `POST /api/radar/refresh` (manual debug path, runs bounded Radar refill)
- `POST /api/radar/cleanup`

Radar Autopilot is wired to Vercel Cron every two hours. It decides no-op vs
real work from inventory health, Source Graph cadence, Library depth, and
context windows before calling expensive discovery.

Bootstrap Mode is the owner-requested foundation builder. Foundation Sprint Mode
is the persistent aggressive builder. When Places, active events, Source Graph,
Candidate Inbox, or Tier A/B Library inventory is thin, the owner can enable
Foundation Sprint from `/settings/library`; the 15-minute cron then runs the
next bounded mission batch until the core targets are healthy.

Foundation Sprint missions include source building, new restaurant openings,
events windows, taste-seed verification, neighborhood/drift lanes, candidate
evaluation, Library conversion, source recheck, and Holding promotion review.
Each batch is capped by provider calls, candidate writes, Library/event writes,
source writes, and operation count. Promotion remains conservative: raw
Candidate Inbox and Library rows do not become Active Radar automatically.

Foundation Sprint is a scheduled batch worker, not a long request. The route has
`maxDuration = 300` as a safety buffer, but the runner uses a shorter internal
budget: 35 seconds for normal Autopilot and 45 seconds for Foundation Sprint.
Sprint batches run one mission per request, check the budget before/after major
steps, save the mission cursor after each completed step, and return before the
platform timeout. Cron resumes from the cursor on the next 15-minute call.

Provider keys matter. Google Places builds places, Ticketmaster builds events,
and Tavily/Brave/SerpAPI build source and opportunity inventory. If no external
discovery provider is configured, bootstrap records a clear missing-provider
summary and creates no fake candidates.

Operational state is durable:

- `radar_autopilot_runs` records scheduled/bootstrap/manual runs, status,
  counts before/after, provider status, and summary.
- `radar_autopilot_activity` records short control-room messages.
- `radar_autopilot_settings` stores pause, stop-after-current-step,
  Foundation Sprint enablement, targets, and mission cursor.

Pause only blocks scheduled cron. Owner-requested runs can still be launched
from `/settings/library`. Stop is cooperative: the current serverless step is
allowed to finish, then Bootstrap checks the flag before starting the next major
operation.

Run status can be `partial_success`. If one mission creates useful rows and a
later mission fails, or the internal time budget is reached after useful work,
the run preserves counts and activity instead of collapsing to a vague failed
state. Provider-specific failures only block affected missions; missing Brave
or SerpAPI must not block Tavily, Google Places, or Ticketmaster work.

Candidate-to-Library conversion runs as a Library mission. It reads unevaluated
`radar_candidate_inbox` rows, classifies durable places/events/sources, applies
taste and negative-filter scoring, upserts strong places into `places_library`,
upserts events into `current_events` only when a real exact start time exists,
and marks weak, duplicate, or ambiguous rows with structured reasons. It never
writes directly to Active Radar.

Discovery quality filters run before and during conversion. Generic Yelp-style
"best 10" pages, MapQuest/directory pages, Men's Wearhouse-style retail chains,
Trivago/hotel aggregators, generic Eventbrite category/search pages, broad SEO
"things to do" lists, and other mission-mismatched source leads are rejected or
heavily penalized with stored reasons such as `generic directory`,
`chain retail mismatch`, `hotel aggregator mismatch`, `generic event page`,
`broad SEO list`, and `mission mismatch`. The filter is contextual: a specific
Eventbrite event or specific OpenTable restaurant page can still be useful,
while generic category/list pages are weak source leads at best.

The Library conversion batch is intentionally small during Foundation Sprint.
It stops when the time budget is near, marks each candidate as it goes, and lets
the next run continue with the remaining inbox rows.

## Foundation Visibility

The owner needs to inspect what Jarvis is finding without turning Radar into a
feed. `/settings/library` now exposes the hidden layers as compact previews:

- Candidate Inbox: latest raw/evaluated rows with type, status, score, source,
  campaign, reason, rejection reason, URL, and discovered time
- Source Graph: testing/watching/cooldown/muted sources with trust, taste,
  novelty, freshness, save/pass/plan rates, last check, and next check
- Places and Events: latest durable Library rows and Event Pulse rows with
  quality tier, score, summary, tags, and timing
- Rejected / Muted: filtered candidates and cooled/muted sources with the
  stored reason
- Tier A/B/C: quick slices of the best Library inventory by quality tier

Timestamps remain UTC in the database and are displayed in the control room as
relative time plus America/Chicago local time unless a richer user timezone is
available later.

Run errors should be visible but safe. Control Room summaries show the actual
run `error_message` with token-like bearer values redacted, plus partial row
counts so "partial success" is understandable without opening Vercel logs.

## Intent-Aware Actions

Radar remains visually quiet. The primary actions stay Save, Plan, and Pass.
Secondary intent chips let the owner mark a candidate as Later, Watch, Better
Version, or Save Taste. These states are stored on the item payload/planning
state, write `item.intent` behavior signals, update Source Graph feedback, and
can create memory proposals. They do not keep the same item pinned in Active
Radar.

- `interested_later`: positive interest, wrong timing. Move/deprioritize from
  Active Radar and allow resurfacing only when timing/context changes.
- `watching`: keep the source/category/lane alive, but do not repeat the same
  unchanged item.
- `better_version`: positive category signal plus negative exact-item signal;
  future missions should search adjacent/better alternatives.
- `saved_reference`: save the taste/library signal without forcing active
  attention.
- `muted` or `passed`: penalize exact item/source/category according to
  severity.

## Promotion Diagnostics

Radar can be quiet while Library and Candidate Inbox grow. That is expected
when items are durable, raw, missing timing, low-confidence, duplicate, or not
better than what is already active. The promotion diagnostic helper reviews:

- raw Candidate Inbox rows
- Holding rows
- Tier A/B Places Library rows
- current upcoming Event Pulse rows

It returns each item with source layer, score, `radarEligible`, reason,
blockers, and next step. Raw Candidate Inbox rows are never Radar-eligible.
Durable places are useful Library context but need a timely plan/reason before
Radar. Current events can be ready for review when timing, source, and quality
are sufficient. Actual Active Radar promotion still happens through Holding and
the existing front-room gates.

## Taste Seed Import

The taste seed importer is not a discovery run and does not call external
providers. It ingests first-party owner markdown as structured context for the
ambient system:

- dry run returns parsed counts and warnings with no database writes
- commit mode writes Circle, Library, Source Graph, memory, taste signals, and
  negative filters with `taste_seed_import` provenance
- ambiguous dates remain planning context instead of fake exact events
- imported places are never promoted directly to Active Radar
- imported people are written to the same `circle_people` source read by Circle,
  and the Library control room reports visible seed people after commit

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
