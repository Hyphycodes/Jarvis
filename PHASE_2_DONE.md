# Phase 2 — Places Library Core — Done

## Files Created
- `supabase/migrations/0006_places_library.sql` — `place_candidates` + `places_library` tables with RLS, indexes, unique constraint on `(user_id, slug)`
- `lib/brain/researcher.ts` — Researcher agent: Google Places + Tavily → Claude synthesis → `ResearcherOutput` dossier
- `lib/brain/verdictWriter.ts` — Verdict Writer agent: dossier + taste context → 2-4 sentence opinionated verdict + `surface_priority`
- `lib/actions/placesLibrary.ts` — Persistence layer: `researchAndStore`, `getLibraryEntryByName`, `getLibraryEntryById`, `listLibrary`, `recordSurfaced`, `recordUserFeedback`
- `app/api/places/research/route.ts` — POST `/api/places/research` manual test endpoint

## Files Modified
- `lib/types/database.ts` — Added standalone `PlaceCandidateRow` and `PlacesLibraryRow` types (not through Database union — migration must be applied first, then `supabase gen types` can regenerate)
- `lib/intelligence/sourceTrust.ts` — Exported `HIGH_TRUST_DOMAINS` array for Researcher's Tavily domain filtering
- `lib/brain/types.ts` — Added `PlacesLibraryRow` import; added `libraryEntries?: PlacesLibraryRow[]` to `CurationInput`
- `lib/brain/curator.ts` — Added `buildLibraryLookup` helper; `renderCuratorPrompt` now adds `known_place` block to matching candidates; system prompt updated with KNOWN PLACES instruction
- `lib/brain/critic.ts` — Added `libraryEntries?` to input; `shortlist_lookup` now includes `known_place` for matched candidates
- `lib/brain/runRadarCuration.ts` — Fetches `places_library` entries after `buildBrainContext()`; passes to both `runCurator` and `runCritic`

## Deviations from Brief
- **`place_candidates` not yet used** — The table exists and is ready for Phase 3 (Scout). Phase 2 writes directly to `places_library` via the API endpoint. Place candidates become relevant when the Scout runs automated discovery.
- **`surface_priority` returned but not stored** — `VerdictOutput.surface_priority` is returned from `researchAndStore` but not yet stored in `places_library` (the column doesn't exist in the schema). The curator/critic injection uses `verdict_strength` as the equivalent signal. This can be added in a future migration if needed.
- **Standalone types** — `PlaceCandidateRow` and `PlacesLibraryRow` are defined as hand-written interfaces (not through `Database["public"]["Tables"][...]`) since the migration hasn't been applied yet and the Supabase type generator hasn't been rerun. After applying the migration: `pnpm supabase gen types typescript --local > lib/types/database.ts` will regenerate properly.
- **`recordSurfaced` reads then writes** — Supabase's JS client doesn't expose a native SQL `times_surfaced + 1` increment without using `rpc`. The current implementation reads the current value then updates. Fine for low-frequency usage; upgrade to a DB function in the future if needed.

## Verification
- `pnpm typecheck` — ✓ Passes with 0 errors
- `pnpm build` — ✓ Succeeds; `/api/places/research` appears in the route list

## Manual Testing Steps
1. Apply `supabase/migrations/0006_places_library.sql` in the Supabase SQL editor
2. Sign in as owner
3. POST `/api/places/research` with `{"name": "Smyth"}` — verify a dossier + verdict returns
4. Try: `Kasama`, `Bavette's Steakhouse`, `Cira`, `Tao Chicago`
5. Expected: Tao gets a skeptical verdict (influencer energy); Kasama and Smyth get strong ones
6. Trigger a radar refresh after researching some places — the Curator's prompt will now include `known_place` blocks for matched candidates

## What's Now Possible
Jarvis remembers named places. Once a place has been researched, every future encounter with it in the Radar pipeline hits a verdict rather than raw snippets — the Curator reasons from "Bavette's-tier room. Worth the wait." instead of parsing article text from scratch. The test endpoint makes it easy to seed the library manually before the automated Scout (Phase 3) takes over discovery.
