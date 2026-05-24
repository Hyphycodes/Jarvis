# Radar — Attention Budget & Inventory Model

## Philosophy

Jarvis is not a feed. Radar is a small, intentional front room — not a scroll.
An empty or near-empty result is always correct when nothing is strong enough.
Silence is better than filler. The system is designed around **restraint**:
Jarvis should think more and show less.

> "It doesn't just cap Radar and risk missing good things. It gives Jarvis a
> front room and a back room."

## Four-Layer Inventory (Sprint 3)

| Layer | Where | Status | Size | Description |
|-------|-------|--------|------|-------------|
| **Active Radar** | `destination="radar"` `status in ("shown","opened")` | visible | 0–10, target 5+ | The front room. Confident moves worth attention now. Fewer than 5 is valid when not enough makes the cut. |
| **Upcoming** | `destination="upcoming"` or saved/planned with future `starts_at` | saved/planned | unbounded | The agenda. Dated saved/planned items grouped by Today/Tomorrow/This Week/Later/No Date. |
| **Holding / Later** | `destination="holding"` `status="discovered"/"shown"` | discovered | ≤30 | The back room. Strong finds that aren't urgent right now. Eligible for promotion to Radar when timing is right. |
| **Archive / History** | All destinations | saved, passed, planned, completed, expired, archived | Unbounded | Everything seen, acted on, or aged out. Searchable in `/account/history`. |

Every item — regardless of layer — has a permanent detail page at `/item/[id]`.
See [`docs/OBJECTS.md`](./OBJECTS.md) for the full item lifecycle.

## Attention Budget Constants

All constants live in `lib/brain/constants.ts`.

| Constant | Default | Purpose |
|----------|---------|---------|
| `RADAR_MIN_ACTIVE_ITEM_TARGET` | 5 | Healthy board target. Never padded with weak filler |
| `RADAR_IDEAL_ACTIVE_ITEM_LIMIT` | 7 | Soft target for Active Radar size |
| `RADAR_ACTIVE_ITEM_LIMIT` | 10 | Hard cap — items beyond this rotate to Holding |
| `RADAR_STALE_SHOWN_DAYS` | 14 | Days before a shown item is stale |
| `RADAR_MIN_CONFIDENCE` | 0.65 | Minimum confidence to reach Active Radar |
| `RADAR_ADMISSION_MIN_CONFIDENCE` | 0.72 | Decision Council minimum for the visible front room |
| `RADAR_UNDERFILLED_PROMOTION_FLOOR` | 0.52 | Medium-quality floor for promoting Holding while Active Radar is below target |
| `RADAR_DEFAULT_SELECTED_LIMIT` | 5 | Curator's default max selections per run |
| `RADAR_HARD_SELECTED_LIMIT` | 10 | Absolute ceiling on Curator selections |
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
  1. refillRadarBoard() — bounded manual refill, no endless append
  2. cleanupRadar() — bad/noisy active rows leave the front room
  3. promoteQualifiedHoldingItems() — underfilled boards scan Holding before new discovery
  4. rotateWeakActiveRadarItems() when force=true — weak/stale shown rows make room
  5. Check cooldown (30 min). Return {skipped:true} if blocked.
  6. expireOldCandidates() — time-expired events → status="expired"
  7. buildBrainContext() — founder, memory, signals, weather, inventory
  8. buildInterestGraph() — seed + memory + behavior nudges  ← Sprint 2.2
  9. runTasteStrategist() — exploration lanes (Claude)        ← Sprint 2.2
 10. buildCuriosityPlan() — lanes → typed source plan         ← Sprint 2.2
 11. gather:
     - Lane-driven: gatherFromCuriosityPlan(plan)
     - Static fallback: gatherRadarCandidates() (no lanes returned)
 12. ingestCandidates() per lane — PROTECTED_STATUSES always skipped
 13. runRadarCuration():
     a. Build pool (radar + holding, status discovered/shown)
     b. Exclude recently-passed items (from context.recentActions)
     c. shortlistByScore() — deterministic top-N by score
     d. runCurator() — Claude or deterministic fallback
     e. runCritic() — Claude or deterministic fallback
     f. Briefing Editor — clean owner-facing display copy for finalists
     g. Decision Council / front-room gate — downgrade or reject weak/noisy candidates
     h. enforceGates() — confidence floor, category quotas, weekday limits
     i. applyDecision() — write status/destination/payload.briefing to DB
     j. enforceActiveRadarCap() — rotate excess shown→holding or discovered
     k. pruneStaleHolding() — archive aged Holding items
     l. Intelligence Core enrichment — vibe, diversity group, score breakdown,
        missing info, and PlanReadiness are written into payload JSON
     m. logDecisionRun() → brain_decision_runs (decision + strategy snapshot)
```

See [`docs/BRAIN.md`](./BRAIN.md) for the Interest Graph + Taste Strategist + Curiosity Engine details.

## Briefing Layer

Radar uses `surfaced_items.payload.briefing` when present. See
[`docs/BRIEFINGS.md`](./BRIEFINGS.md).

Active Radar requires clean briefing copy, a clear action title, a purpose label,
adequate confidence, no major quality flags, and a next action other than
`pass`, `ignore`, `research`, or `watch`. Items with useful signal but weak
timing/evidence are routed to Holding. Low-confidence, generic, source-thin,
literal-query, social-noise, fake-luxury, hype-noise, corny, or SEO-style
results remain discovered or archived.

## Taste Constitution + Decision Council

`lib/brain/tasteConstitution.ts` is the durable internal taste document. It
defines the owner identity frame, core lanes, taste principles, positive
signals, negative signals, spend posture, attention posture, and the Radar
admission rule: do not show what is merely related; only show what creates value
now.

`lib/brain/decisionCouncil.ts` is the deterministic council that every
Radar-visible item passes through:

- Scout: source quality, entity clarity, freshness, trust, and noise.
- Operator: fit with Weekly Rhythm, effort, cost, timing, and friction.
- Taste Strategist: whether it belongs in the owner’s world.
- Growth Coach: whether it sharpens health, skill, ownership, creative work,
  relationships, business, or peace.
- Critic: blocking flags, weak evidence, generic copy, bad titles, stale data.
- Briefing Editor output: action title, purpose label, one-line, best move, and
  display depth.

The council returns `admission = radar | holding | discovered | archive`.
Only `admission="radar"` reaches Active Radar.

The primary card does not show raw query text, strategist lane ids, seed tags,
raw status/destination, or source payload details.

## Surface Rendering

Signed-in Radar is database-backed only. `loadRadarSurface()` reads
`surfaced_items` through `listIndexItems()` for the signed-in/viewable owner,
filters to `destination="radar"` and visible statuses (`shown`, `opened`),
then applies the Decision Council gate again before rendering. It excludes
expired items, sorts by timing, score, then recency, and returns at most 10
cards. Page load never performs external research or refill work.

Authenticated users never see fallback demo cards. If no real rows match,
Radar renders the empty state:

- "Nothing made the cut."
- "Jarvis checked the board. Nothing strong enough to interrupt the day."

Logged-out users still see the separate marketing/empty Radar experience from
`app/(tabs)/radar/Empty.tsx`; that state is intentionally gated away from the
signed-in owner.

For repeatable owner smoke tests, `/account/qa` can create `[QA] Radar dinner
idea` as a real `surfaced_items` row. See [`docs/QA.md`](./QA.md).

## Card Behavior

Each Radar card body links to `/item/[id]`, the universal Consideration Brief.
Cards share the same briefing contract as the detail page:

- verdict or clean category
- display title
- one-line briefing
- Best Move / Jarvis Take
- stored image when available, otherwise a tasteful placeholder
- clean footer with effort, spend, confidence, source domain, or location

Cards do not show raw queries, seed lanes, internal tags, raw destination/status,
or debug labels. The footer keeps the supported item lifecycle actions:

- **Save** calls `POST /api/items/[id]/save`, updates the card state, and lets
  the server route the item to Today, Upcoming, or Holding based on date.
- **Pass** calls `POST /api/items/[id]/pass`, updates the card state, and
  records the rejection signal.
- **View plan** appears only when `payload.plan_slug` exists and links to
  `/plan/[slug]`.

Save/Pass controls are outside the card body link, so they do not navigate
accidentally. Radar only surfaces the plan indicator; it does not force
plan-linked items straight into the plan.

After Save, Pass, Archive, Plan, Move to Holding, or Add to Upcoming, the API
checks the strong Active Radar board. If it drops below
`RADAR_MIN_ACTIVE_ITEM_TARGET`, Jarvis schedules a bounded post-response refill.
The refill uses existing supported source/candidate flows, respects the 10-item
cap, avoids recent Pass near-duplicates, and returns fewer than 5 if the
available pool is not strong enough.

## Intelligence Core Payload

Sprint 7 adds a thin `lib/intelligence` core that wraps the existing Decision
Council, Taste Constitution, source trust, Weekly Rhythm, life cadence, and
briefing conventions. It stores UI-safe metadata in `surfaced_items.payload`:

- `move_title`
- `purpose_label`
- `vibe`
- `diversity_group`
- `radar_disposition`
- `today_disposition`
- `plan_disposition`
- `reason_surfaced`
- `strongest_angle`
- `missing_info`
- `score_breakdown`
- `plan_readiness`
- `intelligence.enriched_at`

`plan_readiness.shouldPreparePlan=true` is only set for high-confidence items
with enough known details. It can include a truth-safe `planSeed`, but never
invents addresses, hours, prices, weather, reservations, or bookings.

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
- Render more than 10 front-room cards, even if more rows are technically active.
- Treat "no rush" as a Radar blocker. Urgency belongs to Today; Radar can keep worthwhile possibilities visible.
- Show placeholder cards to authenticated users.

## Ambient Radar

Manual Refresh now delegates to the ambient `radar_discovery` runner. The normal
product direction is controlled background thinking, not page-load API calls and
not a feed. Ambient runs log run type, strategy lanes, selected/rejected ids,
fallback reason, estimated budget, and source quality metadata into
`brain_decision_runs.raw_output`.

`/account/intelligence` exposes owner-only controls for daily maintenance, Radar
discovery, weekend preview, Holding review, North reflection, and Radar cleanup.

## Source Trust And Cleanup

LocalRadar scores source trust before candidates reach Active Radar. Social
snippets, directory spam, coupon pages, literal query matches, closed events,
old results, and unclear titles are demoted or rejected. Cleanup archives obvious
bad Active Radar items or moves medium-confidence watch items into Holding. It
never deletes records and preserves saved/planned/completed items.

## Front Room Rule

Active Radar is the front room. It only renders `destination="radar"` rows in
`shown` or `opened` state that pass `evaluateActiveRadarItem()`. Raw
`discovered` candidates, Holding items, Watch items, source leads, weak evidence,
social snippets, literal query matches, and "watch for stronger evidence" briefs
do not render on Radar.

Radar worthiness is separate from Today urgency and Plan readiness:

- `radar_disposition=active` means the item is worth keeping visible.
- `today_disposition=today` means the timing is strong enough for Today.
- `plan_disposition=ready|seed|not_ready` controls whether plan generation has
  enough truth-safe detail.

When Active Radar is below `RADAR_MIN_ACTIVE_ITEM_TARGET`, a medium-confidence
Holding item can be promoted if it has a clear title, category/vibe, surfaced
reason, acceptable evidence, and no hard truth/source blockers. "Good signal,
not urgent" is not a reason to hide an otherwise strong Radar possibility.

Zero cards is a valid outcome. The signed-in empty state says: "Nothing made the
cut."

## Action Titles

Radar titles should answer "what is the move?" rather than echo a source
headline. The action-title helper strips queries, platform suffixes, hashtags,
lane ids, and raw comment text. If a clear move cannot be generated, the item is
demoted.

## Purpose Labels

Every Radar card carries a derived purpose label such as Health reset, Skill
rep, Taste development, Ownership lane, Creative fuel, Social room, Outdoor
reset, or Culture signal. The label answers why the item exists in the owner's
life.
