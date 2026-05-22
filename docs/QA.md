# QA Fixtures

`/account/qa` is an owner-only development utility for creating real database
rows that exercise Radar, Today, Upcoming, item detail, and generated plan
lifecycle paths.

It is not product UI and does not create global demo data.

## Safety Gates

The page and server actions require all of:

- authenticated session
- `user.role === "owner"` via the existing owner allowlist/session helpers
- local development (`NODE_ENV=development`) or explicit
  `ENABLE_QA_TOOLS=true`

Logged-out users redirect to login. Non-owner users and disabled environments
receive a 404. The server actions call the same gates, so hidden UI is not the
only protection.

## Created Records

All seeded records use:

- title prefix: `[QA]`
- `payload.qa_fixture = true`
- `payload.created_by = "qa_seed"`
- `user_id` set to the signed-in owner id

Available buttons:

| Button | Records |
|--------|---------|
| Create Radar briefs | five `surfaced_items` rows covering dining/place, event, activity, product/style, and article/idea briefs |
| Create Today item | one `surfaced_items` row, `destination="today"`, today `starts_at`, `status="shown"` |
| Create Upcoming item | one `surfaced_items` row, `destination="upcoming"`, future `starts_at`, `status="shown"` |
| Create Active Plan fixture | source `surfaced_items` row, one active `plans` row, 3 `plan_sections`, 3 `today_timeline_items` |

Create buttons remove the existing matching fixture first, so repeated clicks
do not create duplicates for the same fixture type.

The Radar brief fixtures include realistic `payload.briefing`, source evidence,
and location or media fields where useful:

- `[QA] Radar dinner idea`
- `[QA] Jazz room candidate`
- `[QA] Riding lesson candidate`
- `[QA] Heritage jacket candidate`
- `[QA] Workshop idea article`

They are intended to test `/item/[id]` as the universal Consideration Brief
across different item types.

## Clear Behavior

Clear QA fixtures deletes only current-owner QA rows:

- `[QA]` generated plans
- `plan_sections` and `today_timeline_items` attached to those plans
- `[QA]` timeline rows
- `[QA]` surfaced items

Real user data is not targeted.

## Manual Smoke Checklist

1. Open `/account/qa` as an owner in development or with
   `ENABLE_QA_TOOLS=true`.
2. Create Radar briefs, then open Radar and confirm the `[QA]` brief cards
   appear.
3. Open several Radar card bodies and confirm `/item/[id]` adapts across event,
   activity/place, product/style, and article/idea cases.
4. Use Save or Pass and confirm it does not navigate accidentally.
5. Create Today item and confirm `[QA] Today errand` appears in Today stack.
6. Create Upcoming item and confirm it appears in the Today Upcoming bridge
   and `/upcoming`.
7. Create Active Plan fixture and confirm Today shows the Live Plan module.
8. Confirm Today Next Move uses `[QA] Open the fixture plan`.
9. Open `/plan/qa-active-plan`.
10. Complete or cancel the plan and confirm it leaves Today Live Plan.
11. Clear QA fixtures and confirm `[QA]` rows are gone.
12. Confirm signed-in Radar with zero real rows shows "Nothing on Radar yet."
13. Confirm `/plan/sparrow` still renders.
