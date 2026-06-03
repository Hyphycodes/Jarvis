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
- Bootstrap Mode uses these same tables. It does not add a separate bootstrap
  schema: real provider results enter `radar_candidate_inbox`, real durable
  places/events enter `places_library` / `current_events`, and real domains,
  calendars, venues, or search patterns enter `intelligence_sources`.
- Do not add fake production rows to fill empty states. Synthetic rows belong
  only in tests or QA-only helpers.

## Open questions

- Vector store: Supabase pgvector columns are present; embedding provider is
  interface-only until Voyage/OpenAI keys are configured.
- How to model the Inspired → Remembered arc as state transitions
- Granularity of `taste_graph` edges
