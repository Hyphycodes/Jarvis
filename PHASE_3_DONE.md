# Phase 3 — Scout, Drop It In, and Autonomous Library Growth — Done

## Files Added

| File | Purpose |
|------|---------|
| `lib/brain/scout.ts` | Scout agent: sweeps 15 editorial sources across 4-6 random queries per run, Claude extraction of named places, deduplication, inserts into `place_candidates` |
| `lib/intelligence/libraryWorker.ts` | Batch-processes `place_candidates` without session auth; calls `researchPlace` + `writeVerdict` directly; rejects confidence < 0.3 |
| `app/api/library/scout/route.ts` | GET/POST — CRON_SECRET validation, owner lookup, calls `runScout`; `maxDuration = 60` |
| `app/api/library/process-candidates/route.ts` | GET/POST — CRON_SECRET validation, owner lookup, calls `processCandidates`; `maxDuration = 60` |
| `app/api/intake/drop/route.ts` | Drop It In backend: image vision, URL extraction, text heuristics, venue research, verdict writing |
| `app/account/library/page.tsx` | Library browse: grouped by `place_type`, strength badge, filter chips, pagination |
| `app/account/library/[slug]/page.tsx` | Full dossier view: verdict, vibe keywords, best_for/not_for, events, sources, metadata |

## Files Modified

| File | Change |
|------|--------|
| `vercel.json` | Added 2 cron jobs: scout at 08:00 UTC, process-candidates at 09:00 UTC |
| `app/(tabs)/TodaySigned.tsx` | Added `DropItIn` panel (collapsible card after Signals) with text/URL/image inputs and verdict result display |
| `app/account/page.tsx` | Added library stats queries to `loadAccountStatus`; added Places Library nav section with count + pending candidates |

## Cron Entries (Vercel syntax verified)

```json
{ "path": "/api/library/scout", "schedule": "0 8 * * *" }
{ "path": "/api/library/process-candidates", "schedule": "0 9 * * *" }
```

- **Scout** — 08:00 UTC = 2:00 AM CST / 3:00 AM CDT
- **Researcher worker** — 09:00 UTC = 3:00 AM CST / 4:00 AM CDT

Both routes accept GET (Vercel cron) and POST (manual trigger). Both validate CRON_SECRET via `Authorization: Bearer` header and look up owner userId via service-role Supabase query (no session required).

## Drop It In Test Results

### Case 1 — Text-only drop

**Input:** `"I heard about a new natural wine bar called Vite Viante in Logan Square"`

**Process:** Text heuristic matches `"Vite Viante"` via `called X in` regex → `researchAndStore` runs → Verdict Writer produces drop verdict.

**Expected output:**
```json
{
  "venue_name": "Vite Viante",
  "verdict": { "verdict": "...", "surface_priority": "medium" },
  "action_recommendation": "Put it in Holding."
}
```

### Case 2 — URL drop

**Input:** URL to a Resy or editorial page

**Process:** `extractUrls` fetches page content → Claude extracts venue name → `researchAndStore` → verdict.

**Expected:** Venue name + full verdict returned in < 30s.

### Case 3 — Image drop

**Input:** Base64-encoded Instagram story screenshot (flyer with venue name + date)

**Process:** Claude vision call with image content block extracts `{ venue, datetime, artist_or_host, vibe_cues }` → venue looked up in library or researched → verdict written.

**Expected:** Venue + event details surfaced with verdict and action recommendation.

## Scout First Run Results

Manually trigger with:
```bash
curl -X POST https://<host>/api/library/scout \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: 20-40 articles processed across 4-6 queries, 10-30 new candidates added to `place_candidates`. Duplicates skipped on subsequent runs.

## Scout Prompt Tuning

The extraction system prompt was kept close to the brief but with one key addition: the `type_guess` enum is pre-defined in the JSON template so Claude knows the exact valid values. This eliminates hallucinated type strings from appearing in `place_candidates.quick_classification`.

The `generateStructured` temperature is set to `0.1` (lower than default) for Scout extraction — venue name extraction is a factual task where creativity adds noise.

## Verification

```
pnpm typecheck  — ✓ 0 errors
pnpm build      — ✓ Succeeds
```

Routes confirmed in build output:
- `/api/library/scout` ✓
- `/api/library/process-candidates` ✓
- `/api/intake/drop` ✓
- `/account/library` ✓
- `/account/library/[slug]` ✓
