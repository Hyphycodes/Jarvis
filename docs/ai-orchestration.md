# AI orchestration

Jarvis intelligence starts from one shared context packet and ends by writing
real behavior back into that context. It should not create fake production
content to hide empty data.

## Current loop

```
FounderContextPacket
  -> BrainContext + Interest Graph
  -> Taste Strategist missions
  -> Scout / Researcher / Curator / Critic / Briefing Editor
  -> Decision Council + North alignment
  -> IntelligenceReason + IntelligenceTrace
  -> routed action
  -> behavior signals / memory proposals
  -> future FounderContextPacket
```

## Context

`lib/context/founderContextPacket.ts` is the canonical user-context builder.
Routes and agents should use it, or a derived `BrainContextPacket`, instead of
rebuilding isolated context. The packet pulls real authenticated-user data:
North priorities, Radar saves/passes, Today plans and schedule, Circle moments,
memory, behavior signals, current time, and available location/weather context.

Empty context is valid. Production code should return an empty state, skipped
run, or "nothing worth showing" result rather than demo recommendations.

## Model and source calls

Model calls still go through `/lib/ai` helpers and structured Zod validation.
Agents may fall back deterministically when provider keys are missing, but the
fallback must be based on existing context and candidates.

Scout is mission-driven:

1. Taste Strategist emits exploration lanes and query ideas.
2. `lib/brain/scoutMissions.ts` turns lanes into `ScoutMission`s.
3. `lib/brain/scout.ts` executes those missions against real source adapters.
4. Static curated URLs and query pools are only gated seeds/fallbacks when
   strategist missions are insufficient.
5. Location-specific seeds, including Chicago sources, only run when the user
   profile/location context is compatible.

## Reasoning and traces

`lib/brain/intelligenceReason.ts` provides the reusable "Why this?" payload:
summary, context factors, North alignment, behavior/Circle/memory influence,
timing reason, source strength, and confidence.

`lib/brain/intelligenceTrace.ts` writes compact best-effort traces to
`intelligence_traces`. Store summaries, not huge raw context packets. Trace
writes must never block Radar, Today, chat/voice, plans, cron, or Scout.

## Writeback

Meaningful actions should write behavior signals and, when appropriate, memory
proposals. Save/pass/plan/complete/archive/cancel/chat commands should affect
future scoring through the next context packet.

## Verification

Run:

```bash
pnpm run test:brain
pnpm run typecheck
pnpm run smoke
pnpm run build
git diff --check
```
