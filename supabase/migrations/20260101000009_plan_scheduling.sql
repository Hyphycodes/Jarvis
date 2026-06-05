-- Phase 9: plan scheduling + circle neighborhood
--
-- Adds explicit scheduled date/time + build status to plans (powers the
-- date picker, the in-app calendar, and .ics export), and a neighborhood
-- column on circle_people for the plan "In the Area" lookup.

alter table public.plans
  add column if not exists scheduled_date date,
  add column if not exists scheduled_time time,
  add column if not exists build_status text not null default 'ready';

create index if not exists plans_user_scheduled_idx
  on public.plans (user_id, scheduled_date);

alter table public.circle_people
  add column if not exists neighborhood text;
