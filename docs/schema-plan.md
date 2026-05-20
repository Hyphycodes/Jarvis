# Schema plan

> Draft. Tables are not created yet. This is the conceptual model.

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
- **user_feedback** — accepted / dismissed / saved signals on surfaced items
- **memory_writes** — append-only log of memory updates

## Open questions

- Vector store: pgvector in Supabase vs external
- How to model the Inspired → Remembered arc as state transitions
- Granularity of `taste_graph` edges
