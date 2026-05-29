# Jarvis

A private AI lifestyle operating system for one user. Not a chatbot, not a feed, not a productivity app. A curator, planner, memory, chief of staff, cultural radar, and long-arc advisor.

## What's built

**Four rendering tabs:**
- **Today** — live plan, timeline, grab list, tonight's events, signals, and Drop It In intake
- **Radar** — curated weekly signal with Save / Plan it / Pass inline actions
- **Circle** — inner circle people with updates and context
- **North** — long-arc pillars, life cadence, and direction

**Two-track discovery system:**
- **Track 1 — Places Library:** Persistent library of Chicago places researched by Scout → Researcher → Verdict Writer agents. 50+ entries and growing autonomously.
- **Track 2 — Event Pulse:** Rolling window of events this week and next. Scout → Verdict Writer → surfaced to Tonight and Radar.

**Brain pipeline (5 agents + Decision Council):**
1. Taste Strategist — derives interest lanes and source plan from the Interest Graph
2. Curator — selects candidates from the shortlist; protects attention
3. Critic — stress-tests the Curator's choices
4. Briefing Editor — writes sharp private briefings for each selected item
5. Plan Generator — generates full day plans for saved items

Each agent uses `generateStructured<T>` with Zod-validated output and deterministic fallbacks. No crashes if the API key is missing.

**Decision Council** — deterministic 5-role weighted scorer (Scout, Operator, Taste, Growth, Critic) with 0.72 confidence floor for Active Radar admission.

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
| `pnpm lint`      | Next.js lint                 |

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

## Auth setup

1. Set Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
2. Supabase Auth → URL Configuration: set Site URL and add `${SITE_URL}/auth/callback` to Redirect URLs
3. Apply migrations in `supabase/migrations/` (0001–0008) in the SQL Editor
4. Visit `/login`, sign in with magic link
5. Run in Supabase SQL Editor: `select public.seed_founder('your-email@example.com');`
6. Refresh `/settings` — role should read `owner`

## Cron schedule

All jobs run via Vercel Cron (`vercel.json`) and require `CRON_SECRET` in the `Authorization: Bearer` header.

| Schedule            | Route                            | What it does                                    |
| ------------------- | -------------------------------- | ------------------------------------------------|
| Daily 12:00 UTC     | `/api/intelligence/run?run_type=daily_maintenance` | Cleanup, pattern detection, day-of promotion |
| Fridays 21:00 UTC   | `/api/intelligence/run?run_type=weekend_preview`   | Weekend curation pass                        |
| Daily 8:00 UTC      | `/api/library/scout`             | Discovers new Chicago place candidates          |
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
/supabase/migrations   Schema migrations (0001–0008)
```

## How the brain works

1. **Curation run** triggered by cron or explicit owner action
2. **Taste Strategist** reads the Interest Graph and North pillars → outputs interest lanes and source plan
3. **Scout** (`lib/brain/scout.ts`) queries sources per lane → inserts candidates into `surfaced_items`
4. **Curator** (`lib/brain/curator.ts`) shortlists candidates → selects up to N items for Radar or Holding
5. **Critic** (`lib/brain/critic.ts`) stress-tests the selection → may demote or reject items
6. **Briefing Editor** (`lib/brain/prompts/briefingEditorPrompt.ts`) writes final copy for each item
7. **Decision Council** (`lib/brain/decisionCouncil.ts`) applies deterministic scoring + Phase 6 guardrails
8. Selected items surface to Active Radar; rejected items go to Holding or Discovered

All Claude calls go through `generateStructured<T>` in `lib/ai/structured.ts`. Every agent has a `deterministic*` fallback — the system degrades gracefully without the API key.

## Deploy

Push to `main`. Vercel deploys automatically with the env vars set in the dashboard.
