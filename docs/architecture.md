# Architecture

## Core concept

**APIs discover facts. The directory stores taste. Claude synthesizes
judgment.**

External APIs are commodity inputs — they tell us what exists in the world.
The directory is the user's curated taste graph — it tells us what matters
*to this user*. Claude is the synthesis layer that turns facts plus taste
into judgment.

## Two clocks

1. **Background curation / research** — scheduled jobs in `/jobs` keep the
   research cache and surfaced items warm. They write to memory, not to the
   user's attention.
2. **On-demand deep planning** — user-initiated flows that read from cache
   and memory and call Claude for synthesis.

## Folder layout

- `/app` — Next.js App Router routes
- `/components` — UI primitives and surface components (built later)
- `/theme` — design tokens (built later)
- `/lib/ai` — provider-agnostic AI wrappers and orchestration
- `/lib/directory` — taste graph, places, people, standards, rituals
- `/lib/memory` — read/write the long-term memory layer
- `/lib/research` — external API adapters + research cache
- `/lib/tools` — tool implementations exposed to the AI layer
- `/lib/cache` — caching primitives
- `/lib/scoring` — relevance and surfacing logic
- `/jobs` — scheduled background jobs (the first clock)
- `/docs` — vision, principles, plans

## Priorities

- Design system first
- Centralized AI orchestration
- Directory-first memory system
- Provider-agnostic API wrappers
- Caching
- Memory writeback
- Strong typing
- Modularity
- Observability — later
- Background beats — later
