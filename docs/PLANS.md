# Plans — Generator, Lifecycle, and Dynamic Routes

> Built in Sprint 3.1. A plan is a first-class object. Where Radar/Holding/
> Upcoming says *"this is worth knowing"*, a Plan says *"here's the move"*.

## Architecture

```
Item (planned)
  └─ payload.plan_id        ──► plans row
     payload.plan_slug              │
     payload.plan_status            ├─ plan_sections[]
                                    └─ today_timeline_items[] (optional)
```

A plan is generated from a source IndexedItem on **explicit user action**.
Never automatic. Never on page load.

## Plan lifecycle

| Status | Meaning | Trigger |
|--------|---------|---------|
| `draft` | Generated, not yet started | `POST /api/items/[id]/generate-plan` |
| `active` | Live plan; user chose Start plan | `POST /api/plans/[id]/activate` |
| `completed` | Done; no longer shown as Today live content | `POST /api/plans/[id]/complete` |
| `cancelled` | Dropped; source item returns to Today, Upcoming, or Holding by timing | `POST /api/plans/[id]/cancel` |

Status is stored in `plans.status` (text, no constraint — pre-existing column).

## Plan Generator (`lib/brain/planGenerator.ts`)

Anthropic-first; deterministic fallback when the key is missing or the
model returns invalid JSON.

**Input:**
- source IndexedItem (full Universal Index record)
- Consideration Brief view model, including verdict, best move, indicators, and source evidence
- BrainContext (founder profile, memory, recent actions)
- Interest Graph snapshot
- current weather if already present in BrainContext
- schedule hints (06:20 leave, 16:30 home, weeknight energy)

**Output (Zod-validated `GeneratedPlan`):**

```ts
{
  title, subtitle?, slug,
  plan_type: "dining" | "event" | "activity" | "culture" | "style"
           | "product" | "travel" | "fitness" | "creative"
           | "real_estate" | "land" | "outdoors" | "idea" | "general",
  status: "draft",
  starts_at?, ends_at?,
  location_name?, address?,
  hero_angle,                  // tight one-sentence frame
  why_this_fits,
  best_window?,
  effort_level: "low" | "medium" | "high",
  spending_posture: "free" | "low" | "paid" | "high" | "unknown",
  confidence: 0..1,
  primary_move,                // the obvious first move
  sections: [
    {
      key, title, subtitle?, body, sort_order, section_type, bullets?
    }
  ],                           // 2-11 sections
  timeline: [
    { title, starts_at?, ends_at?, time_label?, description?, sort_order }
  ],                           // 0-8 entries
  grab_list: [ { label, reason? } ],   // 0-8 items
  cautions?: [ string ],       // 0-4 short warnings
  source_item_id?
}
```

### Section types

`why`, `timing`, `before`, `move`, `route`, `atmosphere`, `wear`, `bring`,
`cost`, `detours`, `after`, `alternatives`, `research`, `notes`.

Stored in `plan_sections.section_id` (already plain text — no schema change).
`plan_sections.content` jsonb holds `{ key, body, bullets }`.

### Section standards (enforced by prompt)

Plan sections adapt by item type:

- **Dining/place** — Why This Fits, Best Window, Before You Go, The Move,
  Route / Arrival, Atmosphere, Wear / Bring, Cost Posture, optional Detours,
  After.
- **Event/culture/music/sports** — Why This Fits, Timing, Ticket / Entry
  Check, Before You Go, Route / Arrival, The Move, After, Cost Posture.
- **Activity/outdoors/sports ideas** — Why This Fits, Best Window, Prep,
  Route / Arrival, Effort / Recovery, Gear / Bring, Weather Notes only when
  weather context exists, After.
- **Product/style/gear** — Why This Fits, Use Case, Fit Check, Buy / Hold /
  Compare, Cost Posture, Alternatives, What to Verify, direction fit.
- **Article/idea/land/real estate/creative** — Why It Matters, Research Path,
  Next Questions, Leverage Angle, What to Watch, First Small Move, Hold / Act /
  Archive Recommendation.

No filler. No fake confirmations. No invented addresses. If a reservation
isn't known, the prompt says "confirm" — never pretends booking is done.

### Deterministic fallback

When `ANTHROPIC_API_KEY` is missing or Claude returns invalid JSON:
- 5 honest sections (Why This / Timing / The Move / Details / Next Step)
- Real fields from the item (location, URL, description)
- Uses the local Consideration Brief for the title, best move, and first move
- Cautions includes `"Deterministic draft — refine with Anthropic when available."`
- `fallback_used=true` flag stored in `plans.key_stats.fallback_used`
- Plan is still fully functional and persistable

## Persistence (`lib/actions/plans.ts`)

### `generatePlanForItem({ itemId, force? })`

1. Load source item.
2. If item already has `payload.plan_id` and `force=false`, return existing.
3. Run generator (Claude or deterministic).
4. Compute unique slug per user (appends item-id suffix or `-N` on collision).
5. Insert `plans` row with `status="draft"`, `key_stats` packed with metadata.
   `key_stats` includes `slug`, `starts_at`, `ends_at`, `effort_level`,
   `spending_posture`, `confidence`, `hero_angle`, `why_this_fits`,
   `best_window`, `primary_move`, `location_name`, `address`, `plan_type`,
   source item fields, `fallback_used`, `cautions`, and `grab_list`.
6. Insert `plan_sections` rows.
7. Insert `today_timeline_items` rows if timeline has entries.
8. Update source item:
   - `status = "planned"`
   - `destination` inferred: today (today's date), upcoming (future), holding (no date)
   - `payload.plan_id`, `payload.plan_slug`, `payload.plan_status="draft"`
9. Record `plan.generated` behavior signal.
10. Revalidate `/item/[id]`, `/plan/[slug]`, `/upcoming`, `/`.

### `activatePlan({ planId })`

- `plans.status = "active"`, `live_enabled = true`, `live_label = "LIVE"`
- Source item destination → today (today-dated) or upcoming (future)
- Source item `payload.plan_status = "active"`
- Records `plan.started`

### `completePlan({ planId })`

- `plans.status = "completed"`, `live_enabled = false`
- Source item `status = "completed"`, `payload.plan_status = "completed"`
- Records `plan.completed`

### `cancelPlan({ planId })`

- `plans.status = "cancelled"`, `live_enabled = false`
- Source item drops back to `status = "discovered"` and destination is inferred:
  today for today-dated plans, upcoming for future-dated plans, holding for
  undated/past plans.
- Source item `payload.plan_status = "cancelled"`
- Records `plan.cancelled`

## API surface

| Endpoint | Purpose |
|----------|---------|
| `POST /api/items/[id]/generate-plan` | Generate (or reuse) plan. Body: `{ force?: boolean }` |
| `POST /api/plans/[id]/activate` | Start the plan |
| `POST /api/plans/[id]/complete` | Mark done |
| `POST /api/plans/[id]/cancel` | Drop it |
| `POST /api/plans/[id]/live` | (Pre-existing — Sparrow only) toggle live state |

Response envelopes are clean — no raw Claude JSON is ever exposed to the UI.
The UI calls these endpoints from plan/action buttons, then refreshes the
current route. Lifecycle actions do not create duplicate plans.

## Dynamic plan route (`/plan/[slug]`)

`app/plan/[slug]/page.tsx` server-renders any generated plan via slug lookup
in `plans.key_stats.slug`, with id fallback for uuid-like slugs. Sparrow's
hardcoded `/plan/sparrow` route is preserved alongside — Next.js prefers the
static `sparrow` segment over the dynamic `[slug]` at the same level, so no
collision.

Page shows: back/Today/source navigation, hero, plan-type/status pills,
source/context line, effort/spending/window/source stats, why-this-fits card,
primary move, lifecycle actions, sections, timeline, grab list, cautions, and
quiet empty states when sections or timeline rows are missing.

Primary action labels by status:

| Status | Primary display |
|--------|-----------------|
| `draft` | Start plan |
| `active` | Live + Complete |
| `completed` | Completed |
| `cancelled` | Cancelled |

## Item detail integration

`/item/[id]` Plan section now:

- **No plan** → "Plan this" button (calls `POST /api/items/[id]/generate-plan`)
- **Draft plan** → "Plan Ready", "View Plan", and "Activate Plan"
- **Active plan** → "Live Plan" and "View Active Plan"
- **Completed plan** → "View Completed Plan" (no regenerate offered)

## Today + Upcoming integration

Already automatic via the surface loaders:
- **Today Live Plan** — `loadTodaySurface()` queries live-enabled or `active`
  plans, explicitly excluding draft/completed/cancelled plans. Draft generated
  plans do not appear as live hero content.
- **Today Next Move** — the next non-done timeline item from the active plan is
  the highest-priority command-center item and links back to `/plan/[slug]`.
- **Timeline links** — generated plan timeline rows link to `/plan/[slug]` when
  the plan slug is present. Sparrow remains preserved at `/plan/sparrow`.
- **Today stack** — plan-linked surfaced items prefer `/plan/[slug]`; unplanned
  surfaced items link to `/item/[id]`.
- **Upcoming** — items with future `starts_at` OR `destination="upcoming"`
  show grouped by Today/Tomorrow/This Week/Later/No Date.
- **Upcoming/Holding** — plan-linked items prefer `/plan/[slug]`; unplanned
  items preserve existing `/item/[id]` behavior.
- **Sparrow** — completely preserved as a static demo route.

## Owner QA Fixture

`/account/qa` can create `[QA] Active plan fixture` for owner-only smoke
testing. It writes:

- source `surfaced_items` row with `payload.plan_id`, `payload.plan_slug`,
  `payload.plan_status="active"`, and `payload.qa_fixture=true`
- active `plans` row with `key_stats.slug="qa-active-plan"`
- 3 `plan_sections`
- 3 `today_timeline_items`

Repeated creation clears the existing QA plan fixture first. Clear QA fixtures
removes only `[QA]`/fixture rows for the current owner. See
[`docs/QA.md`](./QA.md).

## Behavior signals

Six new signal types:

| Signal | When |
|--------|------|
| `plan.generated` | After persistence (`itemId`, `fallbackUsed` included) |
| `plan.started` | `activatePlan()` |
| `plan.completed` | `completePlan()` |
| `plan.cancelled` | `cancelPlan()` |
| `plan.viewed` | (Reserved — UI hook not yet wired) |
| `plan.section_opened` | (Reserved — UI hook not yet wired) |

The pre-existing `plan.activate / .complete / .cancel / .open` signals
remain in place (they drive Sparrow's legacy memory rules).

`plan.completed` is the strongest positive signal in `memoryRules.ts`
(strength=`strongest`, confidence=0.85) — repeated completions can
promote to durable taste via the memory proposal system.

## Quality guardrails

The plan generator prompt explicitly forbids:
- Generic itineraries
- Filler sections
- Fake reservation confirmations
- Invented addresses / phone numbers
- Stacking high-effort detours on a weeknight
- "Top 10 things to do" energy

If the model fails any of these, the Zod schema rejects the output and
the deterministic fallback runs.

## What Sprint 3.1 did NOT do

- No full calendar integration
- No cron / background scheduling
- No auto-generation for every item
- No native app work
- No UI redesign
- No raw Claude JSON exposed in UI
- No fake booking / confirmation language
- No schema migration (slug stored in `plans.key_stats.slug`)

## Manual SQL

**None.** All fields fit existing columns:
- `plans.status` — already plain text default `'draft'`
- `plans.key_stats` — jsonb, stores slug + metadata
- `plan_sections.section_id` — plain text, holds new section types
- `today_timeline_items` — pre-existing schema sufficient
