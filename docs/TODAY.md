# Today — Command Center Rules

Today is the command center, not another feed. It reads real generated plans,
timeline rows, and `surfaced_items`; signed-in users should not see demo
Sparrow rows or placeholder signal cards.

## Data Source

`loadTodaySurface()` in `lib/dispatch/loadSurface.ts` builds the payload:

- active/live generated plan from `plans`
- timeline rows from `today_timeline_items`, filtered to the active plan when
  one is live
- real Today items from `surfaced_items` where `destination="today"` and
  status is visible/actionable
- upcoming bridge items from `surfaced_items`
- upcoming count for the `/upcoming` route

Today uses `payload.briefing` for surfaced item title, category/subtitle,
summary, and reason when present, so it shares Radar's cleaned display layer
instead of rendering raw source/query metadata.

Draft, completed, and cancelled plans are excluded from the Live Plan module.
Draft plans can still appear through their linked source item in Today or
Upcoming when the item timing/destination says they belong there; they are not
treated as live until the owner activates them.

When a plan is active, its source item is deduped out of Today stack, On Deck,
Upcoming bridge, and Next Move by matching `payload.plan_id` to the active
`plans.id`. If the active plan has no timeline rows, Today creates one local
fallback timeline row from the plan title/primary move; it does not write a row
on page load.

## Rendering Order

1. **Live Plan** — one compact active generated plan module with title,
   time/context when available, Open plan, and Complete.
2. **No live plan** — calm empty state with one CTA to Radar or Upcoming.
3. **The Day** — active-plan timeline rows in the original time/dot/title/
   chevron structure, with expandable detail and Open plan links.
4. **Grab List** — only when active-plan grab items exist.
5. **On Deck / Today stack / Upcoming** — only distinct surfaced items, never
   the active plan source item.
6. **Next move** — only when there is a distinct item needing attention. The
   active plan timeline is not repeated here.

## Link Rules

- Plan timeline rows expose an Open plan action to `/plan/[slug]`.
- Plan-linked surfaced items link to `/plan/[slug]` when a slug exists, or
  `/plan/[id]` through the uuid fallback.
- Unplanned surfaced items link to `/item/[id]`.
- The Upcoming bridge links to `/upcoming`.

## Empty-State Rules

Empty modules stay quiet:

- no active plan: "No live plan"
- no next move: omit the section
- no Today stack: omit the section
- no Upcoming items/count: omit the bridge

## QA Notes

Use `/account/qa` as an owner in development, or with
`ENABLE_QA_TOOLS=true`, to create real `[QA]` Today, Upcoming, and active plan
fixtures. The active plan fixture is designed to appear once in Live Plan and
then as timeline rows under The Day. See
[`docs/QA.md`](./QA.md).
