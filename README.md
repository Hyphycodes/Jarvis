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
- **Radar Autopilot:** background health checks choose no-op, refill, Holding build, Candidate Inbox build, Library build/refresh, event pulse, or Source Graph work.
- **Foundation Sprint Mode:** when Candidate Inbox, Living Library, Source Graph, or Tier A/B inventory is thin, Autopilot can run persistent bounded mission batches every 15 minutes until the bank is healthy.
- **Living Library + Source Graph:** places, events, tastemakers, and sources form the permanent intelligence bank under Radar. Source cadence adapts from save/pass/plan behavior.
- **Library Control Room:** `/settings/library` shows run state, provider blockers, activity, Foundation Sprint progress, current/next mission, and owner controls for run/pause/resume/stop-after-current-step.
- **Foundation visibility:** the control room also previews Candidate Inbox, Source Graph, Places, Events, rejected/muted rows, and Tier A/B/C inventory so the owner can inspect what Jarvis is finding before Radar.
- **Intent-aware Radar actions:** Radar keeps the primary Save / Plan / Pass actions, with secondary Later / Watch / Better Version / Save Taste intent states that tune timing, Source Graph learning, and future discovery without repeating unchanged items.
- **Radar promotion diagnostics:** `/settings/library` explains why Radar is quiet by reviewing Candidate Inbox, Holding, Tier A/B Library rows, and Event Pulse rows. Raw candidates never promote directly; eligible front-room moves still go through Holding/curation gates, and eligible-but-not-promoted reviews must log a final blocker.
- **Discovery quality filters:** provider results are screened for generic directories, broad SEO lists, chain retail mismatch, hotel/travel aggregator mismatch, and generic event pages before they can pollute Candidate Inbox or Library conversion. Specific event/place pages can still pass when mission-aligned.
- **Taste Seed Importer:** owner-provided markdown taste context can be dry-run or committed into Circle, Library, Source Graph, memory, taste signals, and negative scoring filters without becoming static Radar content.

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
- Candidate Inbox for raw discoveries before they reach Library, Holding, or Radar
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
| `pnpm import:taste-seed -- path/to/file.md` | Dry-run owner taste seed import |
| `pnpm import:taste-seed -- path/to/file.md --commit` | Commit taste seed import with service role |
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
| `TAVILY_API_KEY`                  | recommended | Web search — Scout, Researcher, Refresher, source seeding |
| `GOOGLE_PLACES_API_KEY`           | recommended | Places bootstrap and place details                  |
| `BRAVE_API_KEY`                   | optional | Secondary web search                                |
| `SERPAPI_KEY`                     | optional | Google results fallback                              |
| `TICKETMASTER_API_KEY`            | recommended | Event discovery and Event Pulse                     |
| `MAPBOX_TOKEN`                    | optional | Mapping and geocoding                                |
| `ELEVENLABS_API_KEY`              | optional | Voice — TTS and transcription                        |
| `ELEVENLABS_VOICE_ID`             | optional | ElevenLabs voice ID for Jarvis's voice               |
| `OPENWEATHER_API_KEY`             | optional | Weather context for curation                         |
| `MLB_API_KEY`                     | optional | White Sox schedule                                   |
| `JARVIS_ENABLE_SYNTHETIC_MOVES`   | optional | Defaults off. Opt-in cadence-derived move candidates |

## Auth setup

1. Set Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
2. Supabase Auth → URL Configuration: set Site URL and add `${SITE_URL}/auth/callback` to Redirect URLs
3. Apply migrations in `supabase/migrations/` (0001–0014) in the SQL Editor
4. Visit `/login`, sign in with magic link
5. Run in Supabase SQL Editor: `select public.seed_founder('your-email@example.com');`
6. Refresh `/settings` — role should read `owner`

## Cron schedule

All jobs run via Vercel Cron (`vercel.json`) and require `CRON_SECRET` in the `Authorization: Bearer` header.

| Schedule            | Route                            | What it does                                    |
| ------------------- | -------------------------------- | ------------------------------------------------|
| Daily 12:00 UTC     | `/api/intelligence/run?run_type=daily_maintenance` | Cleanup, pattern detection, day-of promotion |
| Fridays 21:00 UTC   | `/api/intelligence/run?run_type=weekend_preview`   | Weekend curation pass                        |
| Every 2 hours        | `/api/radar/autopilot`          | Chooses maintenance or foundation build        |
| Every 15 minutes     | `/api/radar/autopilot?mode=foundation_sprint` | Runs the next bounded Foundation Sprint mission when enabled |
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
/lib/library           Living Library and Source Graph helpers
/lib/radar             Autopilot, campaigns, Candidate Inbox
/lib/brain/refresher   Library refresher agent
/supabase/migrations   Schema migrations (0001–0014)
```

## How the brain works

1. **Context packet** (`lib/context/founderContextPacket.ts`) gathers real user context only: North, Radar actions, Today plans/events, Circle moments, memory, behavior, time, and available weather/location.
2. **Autopilot health check** reads Active Radar, Holding, Candidate Inbox, Living Library, Source Graph, event freshness, Today/Circle/North readiness, and recent behavior.
3. **Foundation Sprint Mode** can be enabled when foundation targets are thin: places < 300, active events < 150, sources < 100, Candidate Inbox < 500, or Tier A/B < 75. It runs one small mission batch per request with a persisted cursor instead of relying on repeated manual Bootstrap clicks.
4. **Campaign planner** chooses the next useful operation: no-op, refill, Holding/Candidate Inbox/Library build, event pulse, source recheck, weekend/after-work/Circle/North campaign, cleanup, or foundation build.
5. **Scout / source graph / Library workers** execute bounded discovery. Raw discoveries go to Candidate Inbox first; researched durable entities go to Library.
6. **Researcher / Curator / Critic / Briefing Editor** enrich, shortlist, stress-test, and write private briefings.
7. **Decision Council** (`lib/brain/decisionCouncil.ts`) applies deterministic scoring, North alignment, and curation guardrails.
8. **Holding and Active Radar** stay conservative: Library items and Candidate Inbox rows do not automatically become Active Radar.
9. **IntelligenceReason + IntelligenceTrace** record why Jarvis chose or rejected something in compact structured form.
10. **Routed actions** from Radar, Today, plans, chat/voice, and item actions write behavior signals, source stats, and memory proposals.
11. **Future context packets** read those real behavior/memory/source signals, so recommendations improve without fake filler.

If external discovery keys are missing, Foundation Sprint reports the missing providers instead of inventing rows. With Tavily configured but Anthropic missing, Scout can still seed Source Graph and Candidate Inbox from real article results, but it will not fabricate extracted places.

Foundation Sprint is timeout-safe by design. `/api/radar/autopilot` has a
300-second route max duration as a safety buffer, but normal runs use a 35-second
internal budget and Foundation Sprint uses a 45-second internal budget. The
runner checks the budget before/after each major mission step, saves progress,
and returns `partial_success` when useful work happened and the next cron should
continue. A timeout-budget stop is progress, not a failure.

`/settings/library` is the operator view. It reads `radar_autopilot_runs`,
`radar_autopilot_activity`, and `radar_autopilot_settings` to show Running,
Idle, Paused, Blocked, Partial Success, Foundation Sprint, Failed, Healthy, or
Bootstrap needed. Pause affects scheduled maintenance cron; Foundation Sprint
has its own enable/pause flag and mission cursor. Stop means "stop after current
major step."

The control room is also the inspection surface for the hidden layers under
Radar. Candidate Inbox preview shows raw intake, score, source/campaign,
status, reason, and rejection reason. Source preview shows source type, status,
trust/taste/freshness scores, save/pass/plan rates, and check cadence. Rejected
/ muted preview shows what Jarvis filtered out and why. Timestamps are stored
in UTC and displayed in the owner-local view, defaulting to America/Chicago.

Radar promotion diagnostics explain the quiet front room. The diagnostic panel
reviews Candidate Inbox, Holding, Tier A/B places, and current events, then
records blockers such as missing enrichment, missing timing, low confidence,
negative filters, source confidence, duplicate/pass history, or "durable place
but not timely." Only Holding items can be promoted directly to Active Radar,
and only after the existing front-room quality gates pass.

All Claude calls go through `generateStructured<T>` in `lib/ai/structured.ts`. Every agent has a `deterministic*` fallback — the system degrades gracefully without the API key.

Production routes must not invent Radar items, Today suggestions, Circle people, plans, memories, or behavior. Empty real data should produce quiet empty states or skipped output, not generic filler. Synthetic objects belong in tests or QA-only helpers.

## Taste Seed Importer

`POST /api/library/import-taste-seed` accepts owner-only JSON:

```json
{ "markdown": "...", "fileName": "JARVIS TASTE SEED.md", "dryRun": true }
```

Dry run parses the seed and returns counts without writing rows. Commit mode
uses `dryRun: false` and routes the parsed sections into existing systems:

- People go to `circle_people`.
- Upcoming ambiguous dates become `circle_updates` planning context, not fake
  exact `current_events` timestamps.
- Places go to `places_library` with owner-provided provenance and do not
  automatically enter Candidate Inbox, Holding, or Active Radar.
- Taste signals and negative filters go to `taste_signals`; negative filters
  also merge into `founder_profile.avoid_keywords` as scoring penalties.
- Discovery sources go to `intelligence_sources`.
- Operating notes go to `memory_items`.
- The import writes an `intelligence_traces` audit row.

Imported names are anchors and priors. Radar should use the reasons behind
those names to score future candidates, not repeatedly recommend the imported
places themselves.

The Settings Library control room includes a paste-based dry-run/commit action
for owner-provided taste seeds and reports how many imported Circle people are
visible to the Circle data source. Commit mode is idempotent; a repeat import
updates or skips existing people, places, sources, memories, and filters instead
of duplicating them.

## Deploy

Push to `main`. Vercel deploys automatically with the env vars set in the dashboard.
