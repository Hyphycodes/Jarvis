# Today — Command Center Rules

Today is the command center, not another feed. It reads real generated plans,
timeline rows, and `surfaced_items`; signed-in users should not see demo
Sparrow rows or placeholder signal cards.

## Data Source

`loadTodaySurface()` in `lib/dispatch/loadSurface.ts` builds the payload:

- active/live generated plan from `plans`
- timeline rows from `today_timeline_items`
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

## Rendering Order

1. **Live Plan** — active generated plan, status pill, next timeline item,
   compact context, Open plan, and Complete.
2. **No live plan** — calm empty state with one CTA to Radar or Upcoming.
3. **Next move** — next non-done timeline item from the active plan, otherwise
   highest-priority Today surfaced item, otherwise first upcoming item with a
   start time.
4. **Timeline / grab list** — only when real active-plan data exists.
5. **Today stack** — remaining real Today surfaced items.
6. **Upcoming** — 2-3 upcoming items plus the route link.

## Link Rules

- Plan timeline / plan-linked items link to `/plan/[slug]`.
- Unplanned surfaced items link to `/item/[id]`.
- The Upcoming bridge links to `/upcoming`.

## Empty-State Rules

Empty modules stay quiet:

- no active plan: "No live plan"
- no next move: "Nothing needs your attention right now."
- no Today stack: omit the section
- no Upcoming items/count: omit the bridge

## QA Notes

Use `/account/qa` as an owner in development, or with
`ENABLE_QA_TOOLS=true`, to create real `[QA]` Today, Upcoming, and active plan
fixtures. The active plan fixture is designed to appear in Live Plan and to
drive Next Move from its first non-done timeline row. See
[`docs/QA.md`](./QA.md).
