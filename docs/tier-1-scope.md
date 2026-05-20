# Tier 1 scope

The foundation pass. No product screens. No invented UI.

## In scope

- Next.js App Router + TypeScript + Tailwind scaffolding
- Strict env validation via zod (`/lib/env.ts`)
- Supabase client wrappers (anon and service role) in `/lib/supabase`
- Anthropic client wrapper in `/lib/ai`
- `/health` route to confirm env wiring
- Folder skeleton: `/components`, `/theme`, `/lib/{ai,directory,memory,research,tools,cache,scoring}`, `/jobs`, `/docs`
- `.env.example` with the canonical variable names
- README with setup instructions
- Clean build and typecheck
- Vercel-ready

## Out of scope (deliberately)

- Today / Radar / Circle / North / Index / Voice dock screens
- Design tokens and theme decisions
- Schema migrations
- Background jobs
- Auth flows
- AI orchestration logic beyond the client wrapper
