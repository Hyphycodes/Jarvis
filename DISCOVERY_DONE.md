# Discovery Velocity

## What changed

### D.1 — Scout search surface expanded
`lib/brain/scout.ts` now has 46 queries across Food & Dining, Bars & Nightlife, Experiences & Culture, and Sports & Tailgate. Each run picks 6-8 random queries + 2 curated list URLs (from a pool of 15 Eater/Infatuation/Timeout/ChicagoMag list pages). The URL pool uses `extractUrls` (Tavily extract endpoint) for content-rich extraction from specific curated guides.

### D.2 — Scout every 4 hours
`vercel.json`: `"schedule": "0 */4 * * *"` — 6 runs/day.

### D.3 — Researcher every 3 hours, batch 25
`vercel.json`: `"schedule": "0 */3 * * *"` — 8 runs/day.
`lib/intelligence/libraryWorker.ts`: `DEFAULT_LIMIT = 25`, cap removed — 200 candidates processed daily.

### D.4 — Deduplication
Already in place from Phase 3: slug-based dedup checks both `places_library` (by slug) and `place_candidates` (by name slug) before inserting. The slug function lowercases and strips punctuation, making it effectively case-insensitive.

### D.5 — Manual trigger commands
See curl commands below.

### D.6 — iOS voice fix
`lib/voice/elevenlabs.ts`: detects `audio/mp4` MIME type, appends with `audio.mp4` filename instead of `audio.webm`. `model_id: scribe_v1` was already present.

---

## Manual trigger commands

Replace `YOUR_CRON_SECRET` with the value of `CRON_SECRET` in Vercel.

**Production URL:** `https://jarvis-git-main-jerrysanchezpro-1664s-projects.vercel.app`

### Trigger Scout (finds new place candidates)
```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://jarvis-git-main-jerrysanchezpro-1664s-projects.vercel.app/api/library/scout"
```

### Trigger Researcher (researches + adds to library)
```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://jarvis-git-main-jerrysanchezpro-1664s-projects.vercel.app/api/library/process-candidates"
```

### Trigger both in sequence (Scout first, then Researcher 5s later)
```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://jarvis-git-main-jerrysanchezpro-1664s-projects.vercel.app/api/library/scout" \
  && sleep 5 \
  && curl -X GET \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://jarvis-git-main-jerrysanchezpro-1664s-projects.vercel.app/api/library/process-candidates"
```

### Check what's in the pipeline (Supabase)
```sql
-- Pending candidates waiting for Researcher
select count(*), quick_classification from place_candidates
where status = 'pending' group by quick_classification order by count desc;

-- Library growth this week
select count(*) from places_library
where first_seen_at > now() - interval '7 days';

-- Total library
select count(*) from places_library;
```

---

## Expected output

**Scout response:**
```json
{ "ok": true, "articles_processed": 25, "candidates_added": 18, "duplicates_skipped": 7 }
```

**Researcher response:**
```json
{ "ok": true, "researched": 25, "rejected": 3, "errors": [] }
```

---

## Cron schedule (current)

| Schedule | Route | Purpose |
|----------|-------|---------|
| Every 4h | `/api/library/scout` | Finds new candidates |
| Every 3h | `/api/library/process-candidates` | Researches + verdicts |
| Every 2 days 10 UTC | `/api/events/scout` | Finds events |
| Every 2 days 11 UTC | `/api/events/process` | Verdicts events |
| Daily 12 UTC | `/api/intelligence/run?run_type=daily_maintenance` | Brain + pattern detection |
| Fridays 21 UTC | `/api/intelligence/run?run_type=weekend_preview` | Weekend curation |
| Wednesdays 12 UTC | `/api/tastemakers/sweep` | Tastemaker signals |
| Tuesdays 10 UTC | `/api/library/refresh` | Refreshes stale entries |
