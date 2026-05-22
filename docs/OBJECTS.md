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

## Plan Status Seam

`planItem()` sets `payload.plan_status`:
- `"draft"` — placeholder created by clicking **Plan this**. No actual plan yet.
- `"active"` — a real plan exists (linked via `payload.plan_id`).

The item detail page reads `payload.plan_id` first; if present, shows **View Plan**.
Otherwise it offers **Plan this** which creates the draft seam without
building the full plan generator.

When the dynamic plan generator ships, it reads items with
`plan_status="draft"` and produces a real plan record, then updates the
item's `plan_id` and `plan_status="active"`.

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
1. Hero (active plan if any)
2. The Day timeline (existing)
3. Grab list (existing)
4. **On deck today** (new) — up to 3 day-of items linking to detail
5. Upcoming link with count
6. Signals (existing)

The Today loader injects on-deck items read-only. No promotion happens
automatically — that's an explicit owner action.

## Navigation

- `/upcoming` is linked from:
  - Today's "On deck today" section trailing link
  - The `/account/history` header
- Item detail is reachable from:
  - Any Radar card body
  - Any History/Holding list item
  - "On deck today" item rows
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
