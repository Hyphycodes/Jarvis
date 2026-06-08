# Radar Lane-Engine Pattern (dining is the reference)

The dining curation engine (`lib/radar/engine/`) is the strongest version of the Radar
pipeline. This documents its shape so every other lane (events, culture, places, moves, finds)
can follow the **same operating pattern with different domain rules** — not the same UI.

> Dining proved the pattern. Now every lane gets the pattern.

## The pipeline (dining reference)

```
scout (specialist sources)          lib/radar/engine/scout.ts        → sub-library table (status=discovered)
→ pre-score (cheap taste vector)    lib/radar/engine/prescore.ts     → status=scored
→ select finalists (top slice)      lib/radar/engine/finalists.ts    → status=finalist
→ deep enrich (Google Places)       lib/radar/engine/enrich.ts       → google_place_id/photos/address
→ specialist council (4 voices +    lib/radar/engine/council.ts      → status=judged | rejected
   devil's advocate + taste vector)
→ comparative head-to-head          lib/radar/engine/comparative.ts  → category_best (enrichment_data)
→ lane editor (assemble the set)    lib/radar/engine/editor.ts       → radar_library
→ bench (decay/displacement)        lib/radar/engine/bench.ts        → radar_bench (reserve)
→ stage → plan-build → show         lib/radar/engine/render.ts       → surfaced_items (readiness-gated)
                                     app/api/radar/plans/route.ts
```

Orchestrated by `app/api/radar/engine/route.ts` (cron, dining only today). The readiness-gated
`/api/radar/plans` cron stages bench→discovered, builds plans, then flips plan-ready items to shown.

## What makes it work (the transferable principles)

1. **Permanent per-sub-library warehouse.** Each sub-library is a physical table with a shared
   spine (`external_id` dedup, `name`, `lane`, `sub_type`, `neighborhood`, `taste_vector jsonb`,
   `pre_score`, `final_score`, `status`, `council jsonb`, `rejection_stage/reason`, timestamps) plus
   domain columns. Scout never repeats — already-seen `external_id` is skipped; the library grows forever.
2. **Cheap-then-deep.** Pre-score everything cheaply (taste vector, no LLM council); only deep-enrich
   the top slice; only the council judges finalists. Volume in, ruthless funnel down.
3. **Specialist sourcing.** Each sub-library fishes a stocked pond (`SubLibraryConfig.specialistSources`
   + domain `brief`), so candidates arrive higher quality. See `lib/radar/engine/sources.ts`.
4. **Council with a mandatory devil's advocate.** Authenticity + Jerry-fit + devil's-advocate +
   verdict-writer in one structured call. Kills get `rejection_reason='devil_advocate_kill'` + detail
   (the tuning signal). Permissive floor (`COUNCIL_FLOOR`) until the bench is full.
5. **Comparative curation.** Head-to-head ranking within a sub-library → `category_best`, only promoting
   image-complete rows.
6. **Reserve vs featured.** Bench = reserve (decays −0.01/day, competitive displacement, 30d expiry).
   Featured = the shown shelf, **stable** — it does not auto-rotate; reserve churns.
7. **Readiness gate.** Cards stage as `discovered` (invisible); the plan is built; only when
   `payload.plan_status='ready'` does the card flip to `shown`. A card never reaches the board half-built.
8. **Ownership boundary.** `lib/radar/engine/ownership.ts` `ENGINE_OWNED_LANES` — the old promote
   pipeline yields on engine-owned lanes; planned/live/completed items are never touched.
9. **Context-fed.** Council/scout read `buildBrainContext` (founder + declared taste + operating
   posture + experience memories). Decisions are signal-aware.

## The shared lane contract

Lane behavior is formalized in `lib/radar/engine/lanes.ts` (`LANE_ENGINE: Record<RadarLane, LaneEngineConfig>`)
so it is **not hardcoded in random places**:

```ts
type LaneEngineConfig = {
  lane, label,
  detailRoute: "plan" | "find" | "brief",   // dining/events/moves→plan, finds→find, culture/places→brief
  canSchedule, canExpire,                    // events expire; evergreen lanes go to reserve, not death
  northPillars,                              // candidate pillar tags for North attribution
}
```

Shared decision primitives (pure, unit-tested):
- `lib/radar/engine/laneReadiness.ts` — per-lane readiness gate (events need date+venue+source;
  finds need price+image+budget tier; culture needs a cultural reason; places need a location;
  moves need an action/sequence; dining ready by default).
- `lib/radar/engine/recommendationFloor.ts` — suppress generic / weak-facts / duplicate / wrong-category
  / stale-dated-event / fantasy-luxury-unless-requested. The question is "is this strong enough to
  deserve space in his life?", not "can we fill a slot?".
- `lib/radar/engine/pillars.ts` — wraps `attributePillar` (`lib/north/attributionMap.ts`) to tag any
  item with its North pillars.

## Category boundaries (enforced in `lib/radar/category.ts`)

`category` = visible lane; `type` = object kind. A restaurant can be `type=place` but `category=dining`.
- restaurant/bar/cafe/winery/lounge → **dining** (even if type=place)
- hotel/lobby/park/trail/neighborhood/bookstore/scenic → **places** (unless clearly a move)
- basketball/walk/route/class/session/lesson/workout → **moves**
- symphony/orchestra/jazz/exhibit/gallery/museum/film/architecture → **culture** (unless a specific
  date → **events**)
- ticketed + timed → **events**; product/sourceable → **finds**

## Per-lane differences (same skeleton, different rules)

| Lane | detail route | schedule | expire | council emphasis |
|------|---|---|---|---|
| dining | plan | yes | no (evergreen→reserve) | craft, room, reservation, occasion fit |
| events | plan | yes | **yes** (dated) | date/ticket confidence, urgency, venue fit |
| culture | brief | dated only | dated only | depth, originality, taste-stretch |
| places | brief | no | no | atmosphere, location, drift, photo |
| moves | plan | yes | weather-paused | energy/body/peace, friction, gear |
| finds | **find** | no | no | usefulness, budget fit, longevity, dedup. Keeps Product Researcher + `/find/[id]`. |

## Cutover discipline

A lane is cut over to its engine only by adding it to `ENGINE_OWNED_LANES` — done lane-by-lane,
**watched in production** (the dining cutover needed live iteration). Until then a new lane's engine
fills its sub-library + reserve in the background; the existing pipeline keeps serving the visible board.
