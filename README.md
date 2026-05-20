# Jarvis

A private AI lifestyle operating system for one user.

> This repository is the **foundation pass**. Product surfaces (Today,
> Radar, Circle, North, Index, Voice dock) are intentionally not built
> yet. Design direction lands later. See `docs/tier-1-scope.md`.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (Postgres + auth)
- Anthropic API
- Vercel (deploy target)
- pnpm

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill placeholders, or use the values already in .env.local
pnpm dev
```

Open <http://localhost:3000>. Visit `/health` to confirm env vars load.

## Scripts

| script           | description                          |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Local dev server                     |
| `pnpm build`     | Production build                     |
| `pnpm start`     | Run the built app                    |
| `pnpm typecheck` | `tsc --noEmit`                       |
| `pnpm lint`      | Next.js lint                         |

## Environment variables

Defined in `.env.example`. All required keys are validated at runtime by
`lib/env.ts` (zod); the app fails loudly if any required value is missing.

| variable                          | required | notes                               |
| --------------------------------- | -------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | yes      | Supabase project URL                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | yes      | Supabase anon key (client-safe)     |
| `SUPABASE_SERVICE_ROLE_KEY`       | yes      | Server only. Bypasses RLS.          |
| `ANTHROPIC_API_KEY`               | yes      | Anthropic / Claude API key          |
| `CRON_SECRET`                     | yes      | Shared secret for scheduled jobs    |
| `NEXT_PUBLIC_SITE_URL`            | no       | Public origin, used in absolute URLs |

Real values live in Vercel and are committed nowhere. `.env.local` ships
with non-secret placeholders so the app boots locally without network.

## Folder layout

```
/app           Next.js routes
/components    UI primitives (built later)
/theme         design tokens (built later)
/lib/ai        provider-agnostic AI wrappers
/lib/directory taste graph, places, people, standards
/lib/memory    long-term memory layer
/lib/research  external API adapters + research cache
/lib/tools     tool implementations for the AI layer
/lib/cache     caching primitives
/lib/scoring   relevance and surfacing logic
/jobs          background curation jobs
/docs          vision, principles, architecture
```

## Docs

Start with [docs/vision.md](docs/vision.md), then read in this order:

1. `docs/product-principles.md`
2. `docs/design-language.md`
3. `docs/architecture.md`
4. `docs/ai-orchestration.md`
5. `docs/schema-plan.md`
6. `docs/tier-1-scope.md`

## Deploy

Push to `main`. Vercel is configured with the env vars above.
