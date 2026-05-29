# Phase 6 — Curation Guardrails

## What was added

Six code-enforced curation guardrails that keep the library from degrading as it grows.

### 6.1 — Required `why_now`
- `lib/brain/prompts/briefingEditorPrompt.ts`: Added WHY_NOW ENFORCEMENT section requiring specific, evidence-backed `why_now` for any radar item. Generic patterns auto-downgrade to holding.
- `lib/brain/decisionCouncil.ts`: `isGenericWhyNow()` runs deterministically after Claude's briefing. If `why_now` is missing, under 8 words, or matches a generic pattern, the item is forced to holding regardless of what Claude decided.

### 6.2 — Occasion Type Tagging
- `supabase/migrations/0008_occasion_types.sql`: Adds `occasion_type` column to `surfaced_items` and `current_events`, with an index.
- `lib/brain/occasionTypes.ts`: 12-value const enum.
- `lib/brain/briefingTypes.ts`: `occasion_type` added as optional field on `ItemBriefing` schema.
- `lib/brain/prompts/briefingEditorPrompt.ts`: `occasion_type` added as required output field.
- `lib/brain/eventVerdict.ts`: `occasion_type` added to `EventVerdictOutput`.
- `lib/brain/runRadarCuration.ts`: Post-briefing saturation check — if an item's `occasion_type` was already surfaced this week in the same area, it gets demoted to holding.
- `lib/types/database.ts`: `occasion_type` added to `SurfacedItemRow` and `CurrentEventRow` types.

### 6.3 — Cadence-Aware Aperture
- `lib/brain/lifeCadence.ts`: `inferRecentCadence()` queries last 7 days of saves/completions/passes and returns `{ intensity: "heavy" | "moderate" | "quiet" }`.
- `lib/brain/runRadarCuration.ts`: Cadence aperture is applied before the curator call. Heavy week = max 1, moderate = max 3, quiet = max 2. Still respects the hard cap.

### 6.4 — Novelty Floor
- `lib/brain/curator.ts`: NOVELTY RULE added to system prompt.
- `lib/brain/runRadarCuration.ts`: `enforceNoveltyFloor()` runs after briefing quality. If fewer than 60% of radar items are never-surfaced (times_surfaced = 0 from places_library), the most-seen items are demoted to holding until the ratio clears.

### 6.5 — Negative Learning Loop
- `lib/intelligence/patternDetector.ts`: Detects 3 pattern types from last 30 days of behavior — passes by occasion_type, completions by occasion_type, passes by specific place. Creates `memory_update_proposals` for each.
- `lib/intelligence/ambientRuns.ts`: `detectAndProposePatterns()` is called at the end of every `daily_maintenance` run.

### 6.6 — Memory Proposal Review UX
- `app/account/memory/page.tsx`: Shows pending count in header. Passes proposals to `ProposalReview` component.
- `app/account/memory/client-bits.tsx`: `ProposalReview` shows one proposal at a time with large Accept / Snooze 7d / Reject buttons. Dismissed proposals move to the next without a full page reload.
- `lib/memory/memoryProposals.ts`: Snooze stores `snoozed_until` in the proposal's `metadata` JSON field. `listPendingMemoryProposals` filters out proposals that haven't woken up yet.
- `lib/schemas/index.ts`: `memoryProposalActionSchema` now accepts `"snooze"` as a valid action.

### 6.7 — Inline Radar Feedback (Plan it button)
- `app/(tabs)/radar/Signed.tsx`: All radar cards now show 3 buttons: Save / Plan it / Pass (or Save / View plan / Pass if a plan already exists). "Plan it" calls `POST /api/items/[id]/generate-plan` and redirects to the returned `plan_slug`.

## Files changed

| File | Action |
|------|--------|
| `supabase/migrations/0008_occasion_types.sql` | Created |
| `lib/brain/occasionTypes.ts` | Created |
| `lib/intelligence/patternDetector.ts` | Created |
| `lib/brain/prompts/briefingEditorPrompt.ts` | Modified |
| `lib/brain/decisionCouncil.ts` | Modified |
| `lib/brain/briefingTypes.ts` | Modified |
| `lib/brain/eventVerdict.ts` | Modified |
| `lib/brain/lifeCadence.ts` | Modified |
| `lib/brain/curator.ts` | Modified |
| `lib/brain/runRadarCuration.ts` | Modified |
| `lib/intelligence/ambientRuns.ts` | Modified |
| `lib/memory/memoryProposals.ts` | Modified |
| `lib/schemas/index.ts` | Modified |
| `lib/types/database.ts` | Modified |
| `app/account/memory/page.tsx` | Modified |
| `app/account/memory/client-bits.tsx` | Modified |
| `app/(tabs)/radar/Signed.tsx` | Modified |

## Decisions & deviations

- **`occasion_type` in `surfaced_items`**: The column exists in the DB but is not explicitly written during `applyDecision`. It would require a schema+code pass to persist from the briefing. For now it's used in-memory during the curation run's saturation check. A future pass can write it to the row via `UPDATE` after each selection.
- **Snooze implementation**: Uses the existing `metadata: Json` column rather than a dedicated `snoozed_until` column, avoiding a migration. The filter runs in application code on the result of `listPendingMemoryProposals`.
- **Novelty floor matching**: Library lookup is by `name.toLowerCase()`. This covers the common case; a more robust approach would join on `library_place_id` from the `surfaced_items` row.
- **`MemoryProposalStatus`**: `"snooze"` is not a DB status value — snoozed proposals remain `"pending"` with a metadata timestamp.
