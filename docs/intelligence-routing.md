# Intelligence routing

Jarvis routes intelligence through a typed decision stack:

```txt
source adapters -> normalized candidates -> Claude judgment -> routed intelligence -> UI payloads -> behavior signals -> memory proposals
```

The app does not let raw APIs, local fixtures, or model prose reach the UI
directly. Every surfaced item carries a destination, confidence, priority,
source, payload, and reason.

## Tool ownership

- Code owns discipline: contracts, Zod validation, routing, scoring, source
  selection defaults, and quality gates.
- Supabase owns memory and state: canonical memory, proposals, surfaced items,
  plans, live state, Circle, North, and behavior signals.
- pgvector owns semantic recall once embeddings are configured.
- Claude owns taste, atmosphere, relationship nuance, planning, criticism, and
  final director judgment through the existing `/lib/ai` wrapper.
- External APIs will provide facts later through `/lib/research` contracts.

## Surface flow

- Today receives `TodayPayload`: hero, timeline, grab list, and live plan state.
- Radar receives `RadarCard[]`: score, why it fits, why now, and save/pass
  routing destinations.
- Circle receives people and updates grouped into relationship payloads.
- North receives a north star, pillars, and long-term signals.
- Plan Detail receives title, date, location line, live state, key stats, and
  structured sections.

All surfaces are built from `RoutedIntelligence` through
`lib/tools/routeIntelligence.ts` and payload builders.

## Memory proposals

Behavior signals are recorded first. Memory rules decide whether a proposal is
worth creating. Permanent memory is written only after an accepted proposal or
explicit owner action. Random moods, unsupported guesses, sensitive details, and
one-off weak signals stay out of canonical memory.

Signal strength follows this order:

```txt
explicit correction > plan complete/activate > plan open > radar save/pass
```

## Save/pass learning

`radar.save`, `radar.pass`, `item.save`, and `item.pass` are small taste
signals. Sprint 7 enriches these payloads with category, vibe, source domain,
purpose label, confidence, surfaced reason, and action title when available.
They can create pending memory proposals, but do not silently mutate long-term
taste. The next Radar run can still use the recent behavior immediately:

- Save lightly strengthens similar vibe/category/source patterns.
- Pass suppresses near-duplicates and low-fit patterns without overfitting one tap.
- Plan/complete signals are stronger than simple opens.

When an action drops the strong Radar board below the 5-item target, Jarvis can
schedule a bounded post-response refill. The refill respects the 10-item cap and
does not pad with weak filler.

## Future API adapters

`/lib/research` defines source contracts for places, events, maps, weather,
calendar, contacts, music, news, and manual sources. Those adapters should
return `NormalizedCandidate[]`; they should not decide what is premium or what
reaches the UI.

## No product mock data

Product intelligence code returns empty payloads when there is no real data.
Test fixtures belong in `lib/testing/fixtures/` or `tests/fixtures/` only.
Existing signed UI demo rows remain isolated until surfaces are wired to the
new API routes.
