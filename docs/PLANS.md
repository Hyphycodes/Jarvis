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
| `active` | User chose to begin | `POST /api/plans/[id]/activate` |
| `completed` | Done | `POST /api/plans/[id]/complete` |
| `cancelled` | Not doing it | `POST /api/plans/[id]/cancel` |

Status is stored in `plans.status` (text, no constraint — pre-existing column).

## Plan Generator (`lib/brain/planGenerator.ts`)

Anthropic-first; deterministic fallback when the key is missing or the
model returns invalid JSON.

**Input:**
- source IndexedItem (full Universal Index record)
- BrainContext (founder profile, memory, recent actions)
- Interest Graph snapshot
- current weather (best-effort)
- schedule hints (06:20 leave, 16:30 home, weeknight energy)

**Output (Zod-validated `GeneratedPlan`):**

```ts
{
  title, subtitle?, slug,
  plan_type: "dining" | "event" | "culture" | "style" | "travel"
           | "fitness" | "creative" | "real_estate" | "outdoors" | "general",
  status: "draft",
  starts_at?, ends_at?,
  location_name?, address?,
  hero_angle,                  // tight one-sentence frame
  why_this_fits,
  effort_level: "low" | "medium" | "high",
  spending_posture: "free" | "low" | "paid" | "high",
  confidence: 0..1,
  sections: [
    {
      key, title, subtitle?, body, sort_order, section_type, bullets?
    }
  ],                           // 2-11 sections
  timeline: [
    { title, starts_at?, ends_at?, time_label?, description?, sort_order }
  ],                           // 0-8 entries
  grab_list: [ { label, reason? } ],   // 0-8 items
  cautions?: [ string ]        // 0-4 short warnings
}
```

### Section types

`why`, `timing`, `before`, `move`, `route`, `atmosphere`, `wear`, `bring`,
`cost`, `detours`, `after`, `notes`.

Stored in `plan_sections.section_id` (already plain text — no schema change).
`plan_sections.content` jsonb holds `{ key, body, bullets }`.

### Section standards (enforced by prompt)

1. **Why This Fits** — concrete, not generic
2. **Timing** — fits after-work / weekend; if unknown, say what to confirm
3. **Before You Go** — reservation, ticket, dress check
4. **The Move** — the actual plan
5. **Route / Arrival** — only with real location data, otherwise placeholder
6. **Atmosphere** — vibe and expectation
7. **Wear / Bring** — only if useful
8. **Cost Posture** — why spend is or isn't justified
9. **Optional Detours** — 0–3 max, restrained
10. **After** — only if natural

No filler. No fake confirmations. No invented addresses. If a reservation
isn't known, the prompt says "confirm" — never pretends booking is done.

### Deterministic fallback

When `ANTHROPIC_API_KEY` is missing or Claude returns invalid JSON:
- 5 honest sections (Why This / Timing / The Move / Details / Next Step)
- Real fields from the item (location, URL, description)
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
- Source item drops back to `destination = "holding"`, `status = "discovered"`
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

## Dynamic plan route (`/plan/[slug]`)

`app/plan/[slug]/page.tsx` server-renders any generated plan via slug
lookup in `plans.key_stats.slug`. Sparrow's hardcoded `/plan/sparrow`
route is preserved alongside — Next.js prefers the static `sparrow`
segment over the dynamic `[slug]` at the same level, so no collision.

Page shows: hero, plan-type/status pills, when/where/effort/spend stats,
why-this-fits card, action buttons (Begin / Complete / Cancel),
sections (rendered with type-aware structure), timeline (if present),
grab list (if present), cautions (if any).

## Item detail integration

`/item/[id]` Plan section now:

- **No plan** → "Plan this" button (calls `POST /api/items/[id]/generate-plan`)
- **Plan exists** → "View Plan" link to `/plan/[slug]` + "Regenerate" button
  (forces regeneration with `force: true`)
- **Active plan** → "View Active Plan"
- **Completed plan** → "View Completed Plan" (no regenerate offered)

## Today + Upcoming integration

Already automatic via Sprint 3's surface loaders:
- **Today hero** — `loadTodaySurface()` queries the most-recent `draft` or
  `active` plan (cancelled/completed excluded). Live-enabled plans take
  priority over recency.
- **Today on-deck** — items with today's `starts_at` (read-only inclusion,
  max 3) include any item the user has planned for today.
- **Upcoming** — items with future `starts_at` OR `destination="upcoming"`
  show grouped by Today/Tomorrow/This Week/Later/No Date.
- **Sparrow** — completely preserved as a static demo route.

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
