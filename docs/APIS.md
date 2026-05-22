# External APIs

Every source goes through `lib/http.ts` (typed `ApiError`, timeout, GET retry)
and `lib/cache.ts` (in-memory TTL). Adapters return raw API shapes; the
`lib/sources/normalizers.ts` module converts them into `CreateIndexedItemInput`
before `lib/sources/ingest.ts` upserts into `surfaced_items`. Raw API data
never reaches UI components.

All keys are optional. Each adapter exposes a `hasX()` predicate; callers
must probe it before invoking the client. Missing keys never break the build.

| Service        | Purpose                                | Env var                  | Module                       | Key functions                                                                 | Cache TTL | Cost notes |
| -------------- | -------------------------------------- | ------------------------ | ---------------------------- | ----------------------------------------------------------------------------- | --------- | ---------- |
| Open-Meteo     | Weather (current, hourly, daily)       | _(none)_                 | `lib/sources/openMeteo.ts`   | `getCurrentWeather`, `getHourlyForecast`, `getDailyForecast`                  | 30 min    | Free. Imperial + America/Chicago defaults. |
| Google Places  | Places search / nearby / details       | `GOOGLE_PLACES_API_KEY`  | `lib/sources/googlePlaces.ts`| `searchPlaces`, `nearbyPlaces`, `getPlaceDetails`, `getPlacePhotoUrl`         | 6 hr search / 24 hr details | Field masks enforced. Reviews only when `includeReviews: true`. |
| Mapbox         | Geocode, reverse geocode, directions   | `MAPBOX_ACCESS_TOKEN`    | `lib/sources/mapbox.ts`      | `geocode`, `reverseGeocode`, `getDirections`, `getRouteSummary`               | 6 hr      | Walking route fetched only if drive ≤ 1.5 mi. |
| Ticketmaster   | Events near lat/lng                    | `TICKETMASTER_API_KEY`   | `lib/sources/ticketmaster.ts`| `searchEvents`, `getEventDetails`                                             | 6 hr      | Default radius 20 mi. Page size capped at 50. |
| Tavily         | Deeper cultural research + extraction  | `TAVILY_API_KEY`         | `lib/sources/tavily.ts`      | `searchWeb`, `extractUrls`                                                    | 1 hr      | `search_depth: basic` only. Max 10 results / 5 extract URLs. |
| Brave Search   | Backup web search                      | `BRAVE_API_KEY`          | `lib/sources/brave.ts`       | `webSearch`                                                                   | 1 hr      | Backup only, use when Tavily is missing or low-coverage. |
| SerpAPI        | Google Shopping                        | `SERPAPI_KEY`            | `lib/sources/serpapi.ts`     | `searchProducts`                                                              | 6 hr      | Never call speculatively — only when type/category is product/shopping. |
| MLB Stats API  | White Sox schedule + game details      | _(none)_                 | `lib/sources/mlb.ts`         | `getTeamSchedule`, `getWhiteSoxSchedule`, `getGameDetails`                    | 6 hr      | Free. `WHITE_SOX_TEAM_ID` env override (default 145). |

## Curation brain

`lib/brain/runRadarCuration.ts` orchestrates: gather → ingest → score → shortlist → curator → critic → apply → log.

- `lib/brain/context.ts` builds the founder/memory/signals/weather packet.
- `lib/brain/router.ts` is the deterministic shortlister (top-N by score).
- `lib/brain/curator.ts` calls Claude when `ANTHROPIC_API_KEY` is present; otherwise it returns the top-N as a deterministic fallback.
- `lib/brain/critic.ts` challenges weak picks; same Anthropic-fallback pattern.
- Every run writes a row to `brain_decision_runs` (migration `0004`).

## Lifecycle protection

`lib/sources/ingest.ts` will never overwrite an item whose status is `saved`, `passed`, `planned`, `completed`, `archived`, or `opened` — those represent user-owned state. Rediscovery updates fields like description / image / score but leaves status untouched.

## Smoke testing

Run `pnpm smoke` (see `scripts/smoke.ts`). Each service is skipped if its key is missing, so the script can run in fresh environments.

## Manual SQL

After deploying:

1. Apply `supabase/migrations/0004_brain_decision_runs.sql` (`supabase db push` or paste into SQL editor).
2. No data backfill required.
