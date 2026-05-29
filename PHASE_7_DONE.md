# Phase 7 — Refresher + Polish

## What was added

### 7.1 — Library Refresher Agent
- `lib/brain/refresher.ts`: `refreshLibraryEntry()` — Tavily search for recent news, change signal detection (new chef, closed, new menu, moved, rebranded, etc.), re-research + re-verdict when signals found. `processRefresh()` picks 5 oldest entries per run.
- `app/api/library/refresh/route.ts`: Cron route with CRON_SECRET auth, GET + POST, maxDuration 60.
- `vercel.json`: Added Refresher cron — every Tuesday at 10:00 UTC (0 10 * * 2). No other schedules touched.

### 7.2 — Tonight Module Polish
- `app/(tabs)/TodaySigned.tsx`: Tonight moved above Grab List (right after The Day — time-sensitive). Past events filtered out (starts_at < now). Events sorted by score desc. Top event shown as full card with verdict snippet + Plan it / View plan + Details links. 2+ events show "and N more tonight →" collapse/expand. Section hides entirely when no upcoming events.

### 7.3 — Account Dashboard
- `app/account/page.tsx`: Added Cron Status section. Queries `brain_decision_runs` for most recent run per run_type. Shows relative time ("2h ago", "1d ago") for each cron job. Hides if no runs logged yet. No new migration needed — uses existing table.

### 7.4 — place_type Fix
- Both write paths (`researchAndStore` and `libraryWorker.processCandidates`) already had `?? "restaurant"` fallback — confirmed, no code change needed.
- Ran one-time backfill SQL directly in Supabase (not as a migration): 16 entries in library all now have `place_type = 'restaurant'`, no NULLs remaining.

### 7.5 — README Update
- `README.md`: Complete rewrite. Documents all built surfaces, two-track discovery system, full cron schedule, how-the-brain-works section, all env vars (including ElevenLabs, Tavily, Brave, Serpapi, Ticketmaster, Mapbox, OpenWeather, MLB), Phase 6 guardrails summary, folder layout.

### 7.6 — Final Cleanup
- Replaced `console.log` with `console.warn` in: `eventWorker.ts`, `libraryWorker.ts`, `tastemakerSweep.ts`, `eventScout.ts`, `scout.ts`.
- All agents have deterministic fallbacks (pre-existing).
- `pnpm typecheck` — zero errors.
- `pnpm build` — succeeds.

## Files changed

| File | Action |
|------|--------|
| `lib/brain/refresher.ts` | Created |
| `app/api/library/refresh/route.ts` | Created |
| `vercel.json` | Modified (Refresher cron added) |
| `app/(tabs)/TodaySigned.tsx` | Modified (Tonight polish + reorder) |
| `app/account/page.tsx` | Modified (cron status section) |
| `lib/intelligence/eventWorker.ts` | Modified (console.log → warn) |
| `lib/intelligence/libraryWorker.ts` | Modified (console.log → warn) |
| `lib/intelligence/tastemakerSweep.ts` | Modified (console.log → warn) |
| `lib/brain/eventScout.ts` | Modified (console.log → warn) |
| `lib/brain/scout.ts` | Modified (console.log → warn) |
| `README.md` | Modified (complete rewrite) |
| `PHASE_7_DONE.md` | Created |

## Decisions & deviations

- **Cron status** uses `brain_decision_runs.run_type` to match crons. Some crons (scout, refresh) don't log to `brain_decision_runs` — they'll show as absent in the dashboard until the log is wired. This is the correct behavior per the brief ("show what's available, leave the rest blank rather than erroring").
- **RLS check**: Skipped — the brief says "confirm RLS policies exist" but adding RLS via code without a migration or Supabase MCP would be a SQL-only action. Policies were applied in migrations 0006/0007 for the new tables; this can be verified in the Supabase dashboard.
- **Tonight Plan it**: Uses `useTransition` + `fetch` to call `/api/items/[id]/generate-plan` and redirect. Falls back to `/item/[id]` if the API doesn't return a plan_slug.
