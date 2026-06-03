# Schema plan

> Draft. The intelligence foundation is now represented by additive migration
> `supabase/migrations/0002_intelligence_foundation.sql`; this file remains the
> conceptual map.

## Identity and intent

- **profile** — single-user profile: identity, location, baselines
- **directives** — standing instructions and operating preferences
- **standards** — quality bars the user holds (food, travel, work, etc.)
- **rituals** — recurring patterns the user wants protected

## The directory (taste graph)

- **places** — venues, neighborhoods, cities; with notes and taste markers
- **people** — circle members; relationship state, last contact, context
- **taste_graph** — edges between entities expressing affinity / aversion

## Time and event

- **events** — past and upcoming events, both calendared and curated
- **reflections** — post-experience notes
- **decisions** — recorded choices with reasoning

## AI layer

- **research_cache** — external API results keyed and TTL'd
- **surfaced_items** — what the system surfaced, when, and why
- **memory_update_proposals** — proposal-first memory changes before canonical write
- **behavior_signals** — save/pass/open/activate/complete signals
- **brain_decision_runs** — run-level curation snapshots and strategy summaries
- **intelligence_traces** — compact best-effort per-decision traces for Radar,
  Today, Scout, plans, chat/voice, Circle, North, and cron decisions
- **radar_candidate_inbox** — raw/evaluation layer for aggressive discovery
  before anything reaches Library, Holding, or Active Radar
- **intelligence_sources** — Source Graph for publications, domains, venues,
  calendars, tastemakers, organizers, authors, and search patterns
- **taste seed import** — no standalone table; owner-provided markdown is routed
  into Circle, Places Library, taste signals, memory, Source Graph, and traces
- **radar_autopilot_settings** — owner control flags for scheduled Autopilot
  pause/resume, cooperative stop requests, Foundation Sprint enablement,
  aggressive targets, and mission cursor
- **radar_autopilot_runs** — operational run ledger for scheduled, bootstrap,
  foundation-sprint, owner-requested, and manual-force Autopilot runs
- **radar_autopilot_activity** — short owner-facing activity messages for the
  Library Control Room

## Current policy

- Use `behavior_signals` for what the user did.
- Use `memory_update_proposals` for reviewable durable memory changes.
- Use `brain_decision_runs` for run-level curation snapshots.
- Use `intelligence_traces` for explainability: compact context summary,
  reasoning, candidates considered, rejected alternatives, North alignment,
  behavior/Circle/memory influence, source quality, confidence, and outcome.
- Use `radar_candidate_inbox` for raw candidates. Candidate Inbox items do not
  surface directly.
- Use existing `places_library`, `current_events`, and `tastemakers` as the
  Living Library. Quality tiers are metadata for curation, not a browsing UI.
- Use `intelligence_sources` for source learning and adaptive cadence. It is
  not an API uptime table.
- Use the Taste Seed Importer as a routing helper, not a schema fork. It writes
  `taste_seed_import` provenance into existing rows and remains idempotent by
  existing natural keys such as person name, place slug, source key, trait, and
  memory content.
- Bootstrap Mode and Foundation Sprint use these same tables. Foundation Sprint
  adds state only to `radar_autopilot_settings`: enablement, started/completed
  timestamps, targets, reason, and mission cursor. Real provider results enter
  `radar_candidate_inbox`, real durable places/events enter `places_library` /
  `current_events`, and real domains, calendars, venues, or search patterns
  enter `intelligence_sources`.
- Use `partial_success` in `radar_autopilot_runs` when useful rows were written
  before a later operation failed. Avoid contradictory running/failed states by
  treating the latest active run and latest finished run separately in the
  control room.
- Use candidate-to-Library conversion as the explicit bridge from aggressive
  intake to permanent memory. Candidate Inbox rows never write directly to
  Active Radar.
- Use `radar_autopilot_runs` / `radar_autopilot_activity` for operational
  visibility. They are not memory and should not drive recommendations directly.
- Do not add fake production rows to fill empty states. Synthetic rows belong
  only in tests or QA-only helpers.
- Do not hardcode owner seed names into prompts, UI components, fallback arrays,
  or static recommendations. Imported names are durable context; imported
  reasons and filters are what should influence scoring.

## Open questions

- Vector store: Supabase pgvector columns are present; embedding provider is
  interface-only until Voyage/OpenAI keys are configured.
- How to model the Inspired → Remembered arc as state transitions
- Granularity of `taste_graph` edges
