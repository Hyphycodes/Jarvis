# Objects — Item Lifecycle, Destinations, and Detail Hub

> Built in Sprint 3. Every piece of data Jarvis finds becomes a durable
> object in the Universal Index (`surfaced_items`) with a lifecycle state,
> a destination, and a permanent detail page at `/item/[id]`.

## The Universal Index

One table — `surfaced_items` — backs every Jarvis surface (Today, Radar,
Holding, Upcoming, History). Items never move tables; they change
`status` and `destination`.

### Lifecycle states (`IndexItemStatus`)

| Status | Meaning |
|--------|---------|
| `discovered` | Just found by a source adapter. In the pool, not yet shown. |
| `shown` | Active Radar card. Visible on the Radar surface. |
| `opened` | User opened the detail page. |
| `saved` | User saved it — protected from auto-overwrite. |
| `passed` | User passed — protected. Returns to pool after `PASSED_RESURFACE_DAYS`. |
| `planned` | User created or attached a plan — protected. |
| `completed` | Done. Lives in History. |
| `expired` | Date passed (date-based items only). Lives in History. |
| `archived` | User archived. Lives in History but stays restorable. |

### Destinations (`IndexDestination`)

| Destination | What lives here |
|-------------|-----------------|
| `radar` | Active Radar (≤ `RADAR_ACTIVE_ITEM_LIMIT`). The front room. |
| `holding` | Strong but not urgent. The back room. |
| `upcoming` | Dated saved/planned items. The agenda. |
| `today` | Items happening today (manually or via day-of promotion). |
| `north` | Long-term direction-oriented items. |
| `circle` | Items tied to a person in the Circle. |
| `plan` | Items attached to a specific plan. |

Destinations are stored as plain text in `surfaced_items.destination` —
no migration required to add new ones.

## Save Behavior (Sprint 3)

When the user saves an item, the destination is inferred from its dating:

| Item shape | Destination |
|------------|-------------|
| Has `starts_at` today | `today` |
| Has `starts_at` in the future | `upcoming` |
| No `starts_at` | `holding` |

Callers may pass an explicit destination to override.

## Plan Status (Sprint 3.1)

`payload.plan_status` tracks an item's relationship to a generated plan:

| Status | Meaning |
|--------|---------|
| (absent) | No plan exists |
| `"draft"` | Plan generated, awaiting activation |
| `"active"` | Plan in progress |
| `"completed"` | Plan finished |
| `"cancelled"` | Plan dropped |

The item detail page reads `payload.plan_slug` to link to the live plan
at `/plan/[slug]`. **Plan this** triggers `POST /api/items/[id]/generate-plan`
which runs the Plan Generator (see [`docs/PLANS.md`](./PLANS.md)) and
persists a `plans` row + `plan_sections` + optional `today_timeline_items`.

Activate / Complete / Cancel run from the plan detail page via
`POST /api/plans/[id]/{activate|complete|cancel}`. Each propagates back
to the source item's `payload.plan_status` and re-routes its destination
(today / upcoming / holding) as appropriate.

## Universal Item Detail (`/item/[id]`)

Server-rendered. Reads via `getIndexItem(id)`. Shows (when present):

- title, subtitle, category, type
- status, destination
- starts/ends/expires
- location name + address
- score (rounded)
- description
- reasons (why Jarvis surfaced it)
- source evidence — labeled as "Lead", "LocalRadar", or "Strategist lane"
  with source title, domain, and external link
- tags
- plan seam (View Plan or Plan this)
- action grid

Actions exposed:
- Save / Pass
- Add to Upcoming / Remove from Upcoming
- Move to Radar / Move to Holding
- Mark complete
- Archive
- Restore (only on terminal states)

All actions go through `POST /api/items/[id]/[action]` which calls
`dispatchItemAction()` in `lib/actions/items.ts`.

## Upcoming (`/upcoming`)

Standalone route. Groups items into buckets:
- **Today** — `starts_at` falls in the current local day
- **Tomorrow** — `starts_at` falls in the next local day
- **This Week** — `starts_at` within the next 7 days
- **Later** — `starts_at` further out
- **No Date Yet** — `planned` items without a `starts_at`

Pulls saved + planned items with future dates, plus everything where
`destination="upcoming"`. Each card links to `/item/[id]`.

## Day-of Promotion

`lib/scheduling/promoteItems.ts` has two entry points:

1. **`findDayOfItems(userId)`** — Read-only. Returns:
   - `dayOf` — items whose `starts_at` is today (across all destinations)
   - `pastDue` — items whose `starts_at` is in the past

   The Today loader calls this on every render and shows the top 3 as
   "On deck today" (no mutation, no flood).

2. **`runDayOfPromotion()`** — Mutating. Promotes day-of items to
   `destination="today"` and marks past-dated items as `status="expired"`.
   Called only via `POST /api/today/promote` (manual). Never automatic
   on page load.

`MAX_DAY_OF_ON_TODAY = 3` keeps Today restrained.

## Today Integration

Today now shows:
1. Hero summary for the current day
2. **Live Plan** — active/live generated plans only; draft/completed/cancelled
   plans are excluded
3. **Next move** — next active-plan timeline item first, then highest-priority
   Today surfaced item, then the first upcoming item with a clear start time
4. Active plan timeline and grab list when present
5. **Today stack** — remaining real `destination="today"` surfaced items
6. **Upcoming** bridge — 2-3 upcoming items, not a feed

The Today loader injects day-of items read-only for compatibility with the
existing promotion model, but signed-in Today does not render fake Sparrow
timeline, grab-list, or signal rows. No promotion happens automatically —
that's an explicit owner action.

## Navigation

- `/upcoming` is linked from:
  - Today's "On deck today" section trailing link
  - The `/account/history` header
- Item detail is reachable from:
  - Any Radar card body
  - Any History/Holding list item
  - Today stack / Next move item rows
  - Any Upcoming bucket item

The main 4-tab carousel (Today / Radar / Circle / North) is unchanged.

## What Sprint 3 did NOT do

- No Google Calendar integration
- No full calendar clone
- No cron / background scheduling
- No dynamic plan generator (just the seam)
- No native app work
- No UI redesign of existing surfaces
- No raw JSON debug dump anywhere

## Manual SQL

**None.** Destinations are plain text in `surfaced_items.destination`,
so adding `"upcoming"` requires no migration.

## Owner QA Fixtures

`/account/qa` provides an owner-only/dev-only path to create real object rows
without manual Supabase edits. Seeded rows are current-owner scoped, title
prefixed with `[QA]`, and marked with `payload.qa_fixture=true` plus
`payload.created_by="qa_seed"`.

The helper can create Radar, Today, Upcoming, and active generated-plan
fixtures, then clear only `[QA]` fixture rows. See [`docs/QA.md`](./QA.md).
