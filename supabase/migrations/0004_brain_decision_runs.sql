-- =====================================================================
-- Jarvis · brain decision logs
-- Migration 0004: dedicated log for multi-candidate curation runs.
-- The existing `decision_runs` table is shaped for single-decision
-- recommendations; this table records every brain pass (radar refresh,
-- future today/north/circle runs).
-- =====================================================================

create table if not exists public.brain_decision_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  run_type text not null,
  input_summary text,
  candidate_ids text[] not null default '{}',
  selected_ids text[] not null default '{}',
  rejected_ids text[] not null default '{}',
  model text not null default 'deterministic',
  raw_output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists brain_decision_runs_user_created_idx
  on public.brain_decision_runs (user_id, created_at desc);
create index if not exists brain_decision_runs_run_type_idx
  on public.brain_decision_runs (user_id, run_type, created_at desc);

alter table public.brain_decision_runs enable row level security;

drop policy if exists brain_decision_runs_owner_all on public.brain_decision_runs;
create policy brain_decision_runs_owner_all on public.brain_decision_runs
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));
