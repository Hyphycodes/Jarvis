# Phase 1 — Foundation — Done

## Files Created
- `vercel.json` — Two Vercel Cron jobs: daily maintenance (12:00 UTC) and weekend preview (21:00 UTC Friday)
- `lib/brain/seasonality.ts` — Static Chicago-specific seasonal context helper with 8 seasons
- `docs/PHASE_NORTH_WIRING.md` — Placeholder doc explaining deferred North wiring

## Files Modified
- `app/api/intelligence/run/route.ts` — Added GET handler for Vercel Cron; added CRON_SECRET validation on both GET/POST; uses service-role Supabase to find owner user ID and passes it as `ownerUserId` bypass to skip the session-based `requireOwner()`
- `lib/intelligence/ambientRuns.ts` — Added optional `ownerUserId` param to input type; when set, skips `requireOwner()` and uses the provided ID directly (safe because the route has already validated CRON_SECRET)
- `lib/brain/types.ts` — Added `PersonContext` type; added `people: PersonContext[]` field to `BrainContextPacket`
- `lib/brain/context.ts` — Added two parallel Supabase queries (circle_people + circle_updates); builds `PersonContext[]` with latest update per person; returns as `people` in context packet
- `lib/brain/tasteStrategist.ts` — Injected `seasonal_context` (from new helper) and `people` (top 10 by closeness) into the Strategist prompt; added instruction about noting person-relevant connections in `why_it_fits`
- `lib/brain/prompts/briefingEditorPrompt.ts` — Added PEOPLE CONTEXT paragraph instructing the editor to note inner-circle relevance in `jarvis_take` when applicable
- `lib/dispatch/loadSurface.ts` — Added `people: []` to the `buildNorthContext` mock to satisfy updated `BrainContextPacket` type
- `components/index.ts` — Removed `FloatingMicButton` export
- `app/(tabs)/north/Signed.tsx` — Replaced stale TODO comment with explicit deferred-wiring note

## Files Deleted
- `components/FloatingMicButton.tsx` — Orphaned component, removed

## Files Moved
- `app/active/sparrow/` → `_design-reference/sparrow/active/`
- `app/plan/sparrow/` → `_design-reference/sparrow/plan/`

## Deviations from Brief
- **PersonContext lacks `city` and `ethnicity` fields** — the `circle_people` table has neither column. `notable_traits` maps from the `notes[]` array, which can contain free-text heritage/trait info the owner has entered. No schema change needed.
- **Cron uses GET, not POST** — Vercel Cron sends GET requests with the secret in the Authorization header. The route now handles GET (cron) + POST (manual). The run_type is passed via query string (`?run_type=daily_maintenance`) rather than body.
- **CRON_SECRET is already in `.env.example`** — No change needed.
- **`.next/` cache cleared** — Required because stale `.next/types/` files still referenced the moved Sparrow routes and caused typecheck failures.

## Verification
- `pnpm typecheck` — ✓ Passes with 0 errors
- `pnpm build` — ✓ Succeeds; Sparrow routes no longer appear in the build output

## What's Now Possible
Jarvis now runs on its own schedule (daily at 6 AM CST, weekend preview Fridays at 3 PM CST) with no session required — Vercel Cron validates via CRON_SECRET and the route finds the owner via service role. The brain sees the owner's people: when a Colombian restaurant surfaces, the Strategist knows Camila's heritage; when a family-friendly spot comes up, it knows Voo and Jenny have a 1-year-old. The brain also knows what season it is in Chicago, so summer lanes lean lakefront and rooftop while winter lanes lean indoor dining and firelight.
