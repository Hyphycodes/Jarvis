# AI orchestration

All model calls are centralized in `/lib/ai`. Callers never import provider
SDKs directly. This lets us swap providers, add caching, add observability,
and version prompts in one place.

## Layers

1. **Provider wrappers** (`/lib/ai/anthropic.ts`) — thin client setup, keyed
   off validated env. Default model lives here.
2. **Orchestrator** (`/lib/ai/orchestrator.ts`) — composes prompts, pulls context from
   `/lib/memory` and `/lib/directory`, calls tools from `/lib/tools`,
   handles caching via `/lib/cache`.
3. **Surfaces** — UI flows call the orchestrator, never the provider.

## Two clocks, reprise

- Background jobs in `/jobs` call the orchestrator with curation-style
  prompts. Output goes to research cache and surfaced items.
- On-demand flows call the orchestrator with planning-style prompts. Output
  goes to the user and to memory.

## Caching and memory writeback

- Research cache: prefer cached results before hitting external APIs.
- Memory writeback: after meaningful interactions, write summaries,
  decisions, and feedback to the memory layer for future retrieval.

## Tools

The AI is given tools (not free-form web access). Tools live in
`/lib/tools` and are explicit, typed, and auditable.

See `docs/intelligence-routing.md` for the current routing and memory
architecture.
