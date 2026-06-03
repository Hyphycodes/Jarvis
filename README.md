# Jarvis

A private AI lifestyle operating system for one user. Not a chatbot, not a feed, not a productivity app. A curator, planner, memory, chief of staff, cultural radar, and long-arc advisor.

## What's built

**Four rendering tabs:**
- **Today** — live plan, timeline, grab list, tonight's events, signals, and Drop It In intake
- **Radar** — curated weekly signal with Save / Plan it / Pass inline actions
- **Circle** — inner circle people with updates and context
- **North** — long-arc pillars, life cadence, and direction

**Mission-based discovery system:**
- **Taste Strategist missions:** FounderContextPacket + Interest Graph + North + behavior produce exploration lanes before any source is called.
- **Scout / Research / Curator:** Scout executes those missions against real sources, Curator and Decision Council decide what is worth attention, and weak output stays quiet.
- **Seed sources:** static curated URLs and query pools are gated seeds/fallbacks, not the core intelligence. Location-specific seeds only run when profile/location context supports them.

**Brain pipeline (5 agents + Decision Council):**
1. Taste Strategist — derives interest lanes and source plan from the Interest Graph
2. Curator — selects candidates from the shortlist; protects attention
3. Critic — stress-tests the Curator's choices
4. Briefing Editor — writes sharp private briefings for each selected item
5. Plan Generator — generates full day plans for saved items

Each agent uses `generateStructured<T>` with Zod-validated output and deterministic fallbacks. No crashes if the API key is missing.

**Decision Council** — deterministic 5-role weighted scorer (Scout, Operator, Taste, Growth, Critic) with 0.72 confidence floor for Active Radar admission.

**Decision traceability** — major brain actions write compact best-effort `intelligence_traces` with context summary, reasoning, candidates considered, rejected alternatives, North alignment, behavior/Circle/memory influence, confidence, and outcome. Trace writes must never break user routes.

**Phase 6 curation guardrails:**
- Required `why_now` — generic patterns auto-demote to holding
- Occasion type tagging (12 types) + saturation check
- Cadence-aware aperture — heavy weeks get fewer items, not more
- Novelty floor — ≥60% of Radar must be never-surfaced entries
- Negative learning loop — pattern detector proposes memory updates from behavior signals
- One-at-a-time memory proposal review with accept / snooze / reject

**Supporting systems:**
- Voice intake with ElevenLabs TTS and transcription
- Drop It In — paste any text, URL, or screenshot for instant research + verdict
- Tastemaker tracking — 30+ people monitored weekly for fresh signal
- Memory + behavior signal infrastructure
- Canonical FounderContextPacket shared by Radar, Today, Circle, North, plans, chat/voice, cron, and Scout
- Reusable IntelligenceReason payload for "Why this?" explanations
- Library Refresher — catches chef changes, closures, new menus

## Stack

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS
- Supabase (Postgres + auth + RLS)
- Anthropic API (`@anthropic-ai/sdk@0.32.1`)
- ElevenLabs API (voice)
- pnpm
- Vercel (deploy target)

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill placeholders
pnpm dev
```

Open `http://localhost:3000`. Visit `/health` to confirm env vars load.

## Scripts

| script           | description                  |
| ---------------- | -----------------------------|
| `pnpm dev`       | Local dev server             |
| `pnpm build`     | Production build             |
| `pnpm start`     | Run the built app            |
| `pnpm typecheck` | `tsc --noEmit`               |
| `pnpm test:brain` | Brain coherence tests       |
| `pnpm smoke`     | App smoke script             |

## Environment variables

| variable                          | required | notes                                                |
| --------------------------------- | -------- | -----------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`        | yes      | Supabase project URL                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | yes      | Supabase anon key (client-safe)                      |
| `SUPABASE_SERVICE_ROLE_KEY`       | yes      | Server only. Bypasses RLS.                           |
| `ANTHROPIC_API_KEY`               | yes      | Claude API key                                       |
| `CRON_SECRET`                     | yes      | Shared secret for scheduled jobs                     |
| `NEXT_PUBLIC_SITE_URL`            | yes (auth) | Public origin for magic-link redirect              |
| `TAVILY_API_KEY`                  | yes      | Web search — Scout, Researcher, Refresher            |
| `BRAVE_API_KEY`                   | optional | Secondary web search                                |
| `SERPAPI_KEY`                     | optional | Google results fallback                              |
| `TICKETMASTER_API_KEY`            | optional | Event discovery                                      |
| `MAPBOX_TOKEN`                    | optional | Mapping and geocoding                                |
| `ELEVENLABS_API_KEY`              | optional | Voice — TTS and transcription                        |
| `ELEVENLABS_VOICE_ID`             | optional | ElevenLabs voice ID for Jarvis's voice               |
| `OPENWEATHER_API_KEY`             | optional | Weather context for curation                         |
| `MLB_API_KEY`                     | optional | White Sox schedule                                   |
| `JARVIS_ENABLE_SYNTHETIC_MOVES`   | optional | Defaults off. Opt-in cadence-derived move candidates |

## Auth setup

1. Set Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
2. Supabase Auth → URL Configuration: set Site URL and add `${SITE_URL}/auth/callback` to Redirect URLs
3. Apply migrations in `supabase/migrations/` (0001–0011) in the SQL Editor
4. Visit `/login`, sign in with magic link
5. Run in Supabase SQL Editor: `select public.seed_founder('your-email@example.com');`
6. Refresh `/settings` — role should read `owner`

## Cron schedule

All jobs run via Vercel Cron (`vercel.json`) and require `CRON_SECRET` in the `Authorization: Bearer` header.

| Schedule            | Route                            | What it does                                    |
| ------------------- | -------------------------------- | ------------------------------------------------|
| Daily 12:00 UTC     | `/api/intelligence/run?run_type=daily_maintenance` | Cleanup, pattern detection, day-of promotion |
| Fridays 21:00 UTC   | `/api/intelligence/run?run_type=weekend_preview`   | Weekend curation pass                        |
| Daily 8:00 UTC      | `/api/library/scout`             | Runs mission-based Scout discovery              |
| Daily 9:00 UTC      | `/api/library/process-candidates`| Researches and verdicts pending candidates      |
| Every 2 days 10:00 UTC | `/api/events/scout`           | Discovers upcoming events                       |
| Every 2 days 11:00 UTC | `/api/events/process`         | Verdicts and surfaces events                    |
| Wednesdays 12:00 UTC | `/api/tastemakers/sweep`        | Checks tastemaker sources for fresh signal      |
| Tuesdays 10:00 UTC  | `/api/library/refresh`           | Refreshes stale library entries for changes     |

## Folder layout

```
/app                   Next.js routes (tabs, API, account)
/components            UI primitives
/lib/ai                Anthropic wrapper + structured generation
/lib/brain             Agent prompts, curator, critic, briefing editor, plan generator
/lib/intelligence      Ambient runs, library worker, event worker, pattern detector
/lib/memory            Long-term memory layer
/lib/sources           External API adapters (Tavily, Brave, Ticketmaster, Mapbox...)
/lib/brain/refresher   Library refresher agent
/supabase/migrations   Schema migrations (0001–0011)
```

## How the brain works

1. **Context packet** (`lib/context/founderContextPacket.ts`) gathers real user context only: North, Radar actions, Today plans/events, Circle moments, memory, behavior, time, and available weather/location.
2. **Taste Strategist** reads the BrainContext + Interest Graph → outputs exploration missions before any external source call.
3. **Scout** (`lib/brain/scout.ts`) executes strategist missions first. Static curated queries/URLs are gated seeds/fallbacks only.
4. **Researcher / Curator / Critic / Briefing Editor** enrich, shortlist, stress-test, and write private briefings.
5. **Decision Council** (`lib/brain/decisionCouncil.ts`) applies deterministic scoring, North alignment, and curation guardrails.
6. **IntelligenceReason + IntelligenceTrace** record why Jarvis chose or rejected something in compact structured form.
7. **Routed actions** from Radar, Today, plans, chat/voice, and item actions write behavior signals and memory proposals.
8. **Future context packets** read those real behavior/memory signals, so recommendations improve without fake filler.

All Claude calls go through `generateStructured<T>` in `lib/ai/structured.ts`. Every agent has a `deterministic*` fallback — the system degrades gracefully without the API key.

Production routes must not invent Radar items, Today suggestions, Circle people, plans, memories, or behavior. Empty real data should produce quiet empty states or skipped output, not generic filler. Synthetic objects belong in tests or QA-only helpers.

## Deploy

Push to `main`. Vercel deploys automatically with the env vars set in the dashboard.
