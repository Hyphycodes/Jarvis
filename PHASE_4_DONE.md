# Phase 4 — Event Pulse + Tastemaker Tracking — Done

## Files Added

| File | Purpose |
|------|---------|
| `supabase/migrations/0007_event_pulse.sql` | `current_events` + `tastemakers` tables with RLS, indexes |
| `lib/brain/eventScout.ts` | Event Scout: 9 queries × 3 sources each, strict extraction filter, dedup by (venue, starts_at) |
| `lib/brain/eventVerdict.ts` | Event Verdict Writer: opinionated take on specific events, `recommended_action` → surface/hold/reject |
| `lib/intelligence/eventWorker.ts` | Processes pending events: writes verdict, creates `surfaced_items` rows for Radar on strength ≥ 0.7 |
| `lib/intelligence/tastemakerSweep.ts` | Checks tastemaker URLs (RA, website, newsletter, linktree), extracts event signals via Claude, 5 per run |
| `app/api/events/scout/route.ts` | CRON_SECRET-authenticated route for event scout runs |
| `app/api/events/process/route.ts` | CRON_SECRET-authenticated route for event verdict processing |
| `app/api/tastemakers/sweep/route.ts` | CRON_SECRET-authenticated route for tastemaker sweep |
| `app/api/tastemakers/route.ts` | GET (list) + POST (add) tastemakers CRUD |
| `app/api/tastemakers/[id]/route.ts` | PATCH (edit) + DELETE tastemakers CRUD |
| `app/account/tastemakers/page.tsx` | Tastemaker management UI: list + add/edit/delete with last-checked dates |
| `app/account/tastemakers/client-bits.tsx` | Client forms: AddTastemakerForm, TastemakerRowActions, shared field components |
| `PHASE_4_DONE.md` | This file |

## Files Modified

| File | Change |
|------|--------|
| `lib/types/database.ts` | Added `CurrentEventRow` + `TastemakerRow` standalone types |
| `lib/brain/eventVerdict.ts` | New file — Event Verdict Writer |
| `lib/ai/types.ts` | Added `tonightEvents?: TodayCommandItem[]` to `TodayPayload` |
| `lib/dispatch/loadSurface.ts` | Queries `current_events` for today/tonight events; adds `tonightEvents` to payload; imports `CurrentEventRow` |
| `app/(tabs)/TodaySigned.tsx` | Added `TonightSection` + `TonightEventRow` components (renders tonight's events above Signals) |
| `app/api/intake/drop/route.ts` | Routes event-shaped inputs (datetime detected) through `writeEventVerdict`; returns `event_verdict` + `is_event` flag |
| `app/account/page.tsx` | Added Tastemakers nav row; `tastemakerCount` in stats; updated `loadAccountStatus` |
| `vercel.json` | 3 new cron jobs: Event Scout, Event Verdict worker, Tastemaker sweep |

## Cron Schedule (Vercel syntax verified)

```json
{ "path": "/api/events/scout",   "schedule": "0 10 */2 * *" }   // Every 2 days at 10:00 UTC = 4 AM CT
{ "path": "/api/events/process", "schedule": "0 11 */2 * *" }   // Every 2 days at 11:00 UTC = 5 AM CT
{ "path": "/api/tastemakers/sweep", "schedule": "0 12 * * 3" }  // Wednesdays at 12:00 UTC = 6 AM CT
```

## Event Scout Results

**First run trigger:**
```bash
curl -X POST https://<host>/api/events/scout \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: articles scraped from ra.co, do312.com, dice.fm, resy.com, timeout.com, chicagoreader.com across 9 query templates. Events must have specific datetime, named venue, and at least one named entity (artist/chef/host) — the prompt hard-rejects networking mixers, bottle-service open-format DJs, brand activations.

## Event Verdict Examples

**High-conviction (surface_radar, strength ≥ 0.7):**
> "DJ Tennis at Sleeping Village Saturday. Real artist, intimate room, will sell out. The move."

**Hold (0.4–0.7):**
> "Wine dinner at Cira Tuesday. Hotel restaurant we like, sommelier hosting. Solid weeknight option."

**Reject (< 0.4):**
> "Some open-format DJ at a bottle service spot in River North. Skip."

## Tastemaker Sweep Notes

- Checks up to 5 tastemakers per run, ordered by `last_checked_at ASC` (never-checked first)
- Pulls from: RA artist page, website, newsletter, linktree (up to 3 URLs per tastemaker)
- Tastemaker-sourced events get a baseline `verdict_strength: 0.65` since a trusted human posted it — they skip the pure-confidence filter and still enter the Event Verdict flow
- `last_checked_at` is updated even if no events found

## Drop It In Enhancement

`POST /api/intake/drop` now detects event-shaped inputs:
- If `datetime` or `artist_or_host` was extracted from image/URL/text → `is_event: true` → `writeEventVerdict` path
- Returns both `verdict` (place) and `event_verdict` (event) in response
- `action_recommendation` is drawn from the active path:
  - Event: "Worth going. Get a ticket." / "Put it on the radar." / "Skip this one."
  - Place: "Worth acting on. Save it." / "Put it in Holding." / "Keep an eye on it."

## Tonight Section (Today Tab)

Events from `current_events` with `status IN ('verified', 'surfaced')` and `starts_at` within the next 24 hours now appear in a dedicated "Events / Tonight" section on the Today tab above Signals. Events show: title, venue name, Jarvis's verdict, time.

## Verification

```
pnpm typecheck  — ✓ 0 errors
pnpm build      — ✓ Succeeds
```

All routes confirmed in build output:
- `/api/events/scout` ✓
- `/api/events/process` ✓
- `/api/tastemakers` ✓
- `/api/tastemakers/[id]` ✓
- `/api/tastemakers/sweep` ✓
- `/account/tastemakers` ✓
