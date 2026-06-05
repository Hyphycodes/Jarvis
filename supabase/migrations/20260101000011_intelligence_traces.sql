-- Sprint 11: durable, compact decision traces.
--
-- `brain_decision_runs` remains the run-level curation log. This table stores
-- smaller per-decision/action traces that can explain why Jarvis chose, skipped,
-- or routed something without persisting a full context packet.

create table if not exists public.intelligence_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  route text not null,
  surface text not null,
  decision_type text not null,
  entity_type text,
  entity_id text,
  context_summary jsonb not null default '{}'::jsonb,
  reasoning jsonb not null default '{}'::jsonb,
  candidates_considered jsonb,
  selected_candidate jsonb,
  rejected_candidates jsonb,
  north_alignment jsonb,
  behavior_influence jsonb,
  circle_influence jsonb,
  memory_influence jsonb,
  source_quality jsonb,
  confidence numeric,
  outcome text,
  created_at timestamptz not null default now(),
  constraint intelligence_traces_surface_check check (
    surface in ('radar', 'today', 'circle', 'north', 'chat', 'voice', 'plan', 'scout', 'cron')
  ),
  constraint intelligence_traces_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  )
);

create index if not exists intelligence_traces_user_created_idx
  on public.intelligence_traces (user_id, created_at desc);
create index if not exists intelligence_traces_user_surface_idx
  on public.intelligence_traces (user_id, surface, created_at desc);
create index if not exists intelligence_traces_entity_idx
  on public.intelligence_traces (user_id, entity_type, entity_id, created_at desc)
  where entity_id is not null;

alter table public.intelligence_traces enable row level security;

drop policy if exists intelligence_traces_owner_all on public.intelligence_traces;
create policy intelligence_traces_owner_all on public.intelligence_traces
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));
