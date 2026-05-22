# Radar — Attention Budget & Inventory Model

## Philosophy

Jarvis is not a feed. Radar is a small, intentional tray — not a scroll.
An empty or near-empty result is always correct when nothing is strong enough.
Silence is better than filler. The system is designed around **restraint**.

> "It doesn't just cap Radar and risk missing good things. It gives Jarvis a
> front room and a back room."

## Four-Layer Inventory (Sprint 3)

| Layer | Where | Status | Size | Description |
|-------|-------|--------|------|-------------|
| **Active Radar** | `destination="radar"` `status in ("discovered","shown","opened")` | visible | 7–12 | The front room. Timely, high-confidence items worth acting on this week. |
| **Upcoming** | `destination="upcoming"` or saved/planned with future `starts_at` | saved/planned | unbounded | The agenda. Dated saved/planned items grouped by Today/Tomorrow/This Week/Later/No Date. |
| **Holding / Later** | `destination="holding"` `status="discovered"/"shown"` | discovered | ≤30 | The back room. Strong finds that aren't urgent right now. Eligible for promotion to Radar when timing is right. |
| **Archive / History** | All destinations | saved, passed, planned, completed, expired, archived | Unbounded | Everything seen, acted on, or aged out. Searchable in `/account/history`. |

Every item — regardless of layer — has a permanent detail page at `/item/[id]`.
See [`docs/OBJECTS.md`](./OBJECTS.md) for the full item lifecycle.

## Attention Budget Constants

All constants live in `lib/brain/constants.ts`.

| Constant | Default | Purpose |
|----------|---------|---------|
| `RADAR_IDEAL_ACTIVE_ITEM_LIMIT` | 7 | Soft target for Active Radar size |
| `RADAR_ACTIVE_ITEM_LIMIT` | 12 | Hard cap — items beyond this rotate to Holding |
| `RADAR_STALE_SHOWN_DAYS` | 14 | Days before a shown item is stale |
| `RADAR_MIN_CONFIDENCE` | 0.65 | Minimum confidence to reach Active Radar |
| `RADAR_DEFAULT_SELECTED_LIMIT` | 5 | Curator's default max selections per run |
| `RADAR_HARD_SELECTED_LIMIT` | 9 | Absolute ceiling on Curator selections |
| `RADAR_SHORTLIST_LIMIT` | 20 | Candidates passed to Curator from scorer |
| `PASSED_RESURFACE_DAYS` | 30 | Days before a passed item re-enters the pool |
| `HOLDING_ITEM_LIMIT` | 30 | Max Holding items; oldest are archived over the limit |
| `HOLDING_STALE_DAYS` | 45 | Days before a Holding item is archived |
| `RADAR_REFRESH_COOLDOWN_MINUTES` | 30 | Minimum time between Radar refresh runs |

## Category Quotas (per refresh run)

| Category | Quota |
|----------|-------|
| Dining / Restaurant | ≤ 3 |
| Events | ≤ 3 |
| Products / Style | ≤ 2 |
| North ideas | ≤ 2 |

Items exceeding a quota are rerouted to Holding instead of being rejected.

## Weekday Energy Limits (Mon–Thu)

| Tag | Weekday cap |
|-----|-------------|
| `paid` / `ticketed` | ≤ 2 on Active Radar |
| `high-effort` / `all-day` | ≤ 1 on Active Radar |

Over-quota weekday items move to Holding, not rejected.

## Source Volume Cap

Total candidates across all lanes per refresh: **60 max** (`MAX_TOTAL_SOURCE_CANDIDATES_PER_REFRESH`).

If the cap is reached mid-gather, remaining lanes are skipped cleanly.

SerpAPI (shopping) is **never** called speculatively — only on explicit product requests.  
Brave is the fallback for Tavily (never both at once in the same lane).

## Local Cultural Radar

`lib/sources/localRadar.ts` — six focused web-research query groups:

| Group | Type | Focus |
|-------|------|-------|
| `chicago_food` | restaurant | New openings, atmospheric dining |
| `chicago_culture` | culture | Art, galleries, exhibits |
| `chicago_music` | event | Jazz, live music, intimate venues |
| `chicago_style` | place | Menswear, boutiques, craft leather |
| `chicago_products` | product | Artisan goods, handcraft |
| `italy_travel_lifestyle` | culture | Italian craft, slow living, lifestyle |

Preferred domains are specified per group to prioritize quality sources (Eater, Monocle, etc.).
Tavily is used first; Brave is the fallback if Tavily is not configured.

**Lead extraction**: article titles and snippets are scanned for named places/businesses.
Extracted lead names are stored in `raw_payload.lead_name`. Items tagged `article-lead`
are candidates for Google Places enrichment downstream.

## Refresh Flow

```
POST /api/radar/refresh
  1. Check cooldown (30 min). Return {skipped:true} if blocked.
  2. expireOldCandidates() — time-expired events → status="expired"
  3. buildBrainContext() — founder, memory, signals, weather, inventory
  4. buildInterestGraph() — seed + memory + behavior nudges  ← Sprint 2.2
  5. runTasteStrategist() — exploration lanes (Claude)        ← Sprint 2.2
  6. buildCuriosityPlan() — lanes → typed source plan         ← Sprint 2.2
  7. gather:
     - Lane-driven: gatherFromCuriosityPlan(plan)
     - Static fallback: gatherRadarCandidates() (no lanes returned)
  8. ingestCandidates() per lane — PROTECTED_STATUSES always skipped
  9. runRadarCuration():
     a. Build pool (radar + holding, status discovered/shown)
     b. Exclude recently-passed items (from context.recentActions)
     c. shortlistByScore() — deterministic top-N by score
     d. runCurator() — Claude or deterministic fallback
     e. runCritic() — Claude or deterministic fallback
     f. enforceGates() — confidence floor, category quotas, weekday limits
     g. applyDecision() — write status/destination to DB
     h. enforceActiveRadarCap() — rotate excess shown→holding or discovered
     i. pruneStaleHolding() — archive aged Holding items
     j. logDecisionRun() → brain_decision_runs (decision + strategy snapshot)
```

See [`docs/BRAIN.md`](./BRAIN.md) for the Interest Graph + Taste Strategist + Curiosity Engine details.

## Surface Rendering

Signed-in Radar is database-backed only. `loadRadarSurface()` reads
`surfaced_items` through `listIndexItems()` for the signed-in/viewable owner,
filters to `destination="radar"` and active visible statuses
(`discovered`, `shown`, `opened`), excludes expired items, sorts by timing,
score, then recency, and returns at most 12 cards.

Authenticated users never see fallback demo cards. If no real rows match,
Radar renders the empty state:

- "Nothing on Radar yet"
- CTA to `/account/intelligence` so the owner can run the explicit Radar
  refresh path

Logged-out users still see the separate marketing/empty Radar experience from
`app/(tabs)/radar/Empty.tsx`; that state is intentionally gated away from the
signed-in owner.

## Card Behavior

Each Radar card body links to `/item/[id]`. The footer keeps the supported
item lifecycle actions:

- **Save** calls `POST /api/items/[id]/save`, updates the card state, and lets
  the server route the item to Today, Upcoming, or Holding based on date.
- **Pass** calls `POST /api/items/[id]/pass`, updates the card state, and
  records the rejection signal.
- **View plan** appears only when `payload.plan_slug` exists and links to
  `/plan/[slug]`.

Save/Pass controls are outside the card body link, so they do not navigate
accidentally. Radar only surfaces the plan indicator; it does not force
plan-linked items straight into the plan.

## Memory of Rejections

When a user taps **Pass** on a Radar card:
- `status` → `"passed"`
- `behavior_signals` row inserted (`signal_type: "item.pass"`)
- `memoryRules` evaluates whether to propose a new memory item

Passed items respect `PASSED_RESURFACE_DAYS` (30 days). Items reset to `"discovered"`
after the window are eligible to re-enter the pool on the next refresh.

## What Jarvis Will Never Do

- Call any source API on page load or automatic schedule.
- Let Claude directly write to the database.
- Overwrite `saved`, `passed`, `planned`, `completed`, `archived`, or `opened` status.
- Run SerpAPI speculatively (shopping only on explicit product request).
- Show more than `RADAR_ACTIVE_ITEM_LIMIT` (12) items on Active Radar.
- Route an item to Active Radar with confidence < `RADAR_MIN_CONFIDENCE` (0.65).
- Show placeholder cards to authenticated users.
