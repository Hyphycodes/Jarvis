-- =====================================================================
-- Jarvis · founder profile + taste memory core
-- Migration 0001: schema, RLS, triggers, helpers
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  home_city text,
  timezone text,
  app_role text not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_app_role_check check (app_role in ('owner', 'viewer'))
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.tg_set_updated_at();

-- When a new auth user is created, mirror a baseline profile row.
create or replace function public.tg_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, app_role)
  values (new.id, new.email, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.tg_handle_new_auth_user();

-- ---------------------------------------------------------------------
-- Role helpers (used by RLS policies on every owner-scoped table)
-- ---------------------------------------------------------------------
create or replace function public.is_app_owner(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select app_role = 'owner' from public.profiles where id = uid),
    false
  );
$$;

-- "demo visible" rows are rows owned by any account flagged 'owner'.
-- Viewers can read these; only the owner themselves can mutate them.
create or replace function public.is_demo_visible_user(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select app_role = 'owner' from public.profiles where id = target),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 2. founder_profile
-- ---------------------------------------------------------------------
create table if not exists public.founder_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,

  -- Identity & values
  faith_values text,
  life_direction text,
  current_focus text,
  values text[] not null default '{}',
  pinned_principles text[] not null default '{}',

  -- Taste shape
  vibe_keywords text[] not null default '{}',
  avoid_keywords text[] not null default '{}',
  dealbreakers text[] not null default '{}',
  luxury_style text,
  energy_preference text,
  social_preference text,
  budget_posture text,

  -- Domain preferences
  food_preferences text[] not null default '{}',
  music_preferences text[] not null default '{}',
  venue_preferences text[] not null default '{}',
  style_preferences text[] not null default '{}',
  travel_preferences text[] not null default '{}',

  -- North-star goals
  active_projects text[] not null default '{}',
  financial_goals text[] not null default '{}',
  creative_goals text[] not null default '{}',
  health_goals text[] not null default '{}',
  travel_goals text[] not null default '{}',
  cultural_growth_edges text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger founder_profile_set_updated_at
before update on public.founder_profile
for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. memory_items
-- ---------------------------------------------------------------------
create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  content text not null,
  kind text not null,
  status text not null default 'active',

  confidence numeric not null default 0.5,
  frequency int not null default 1,
  last_reinforced_at timestamptz not null default now(),
  source text,
  is_pinned boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint memory_items_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint memory_items_frequency_check check (frequency >= 1),
  constraint memory_items_status_check check (status in ('active', 'archived', 'fading')),
  constraint memory_items_kind_check check (kind in ('identity', 'preference', 'pattern', 'principle', 'context'))
);

create index if not exists memory_items_user_status_idx
  on public.memory_items (user_id, status);
create index if not exists memory_items_user_pinned_idx
  on public.memory_items (user_id, is_pinned);

create trigger memory_items_set_updated_at
before update on public.memory_items
for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. taste_signals
-- ---------------------------------------------------------------------
create table if not exists public.taste_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  trait text not null,
  direction text not null,
  category text,
  weight numeric not null default 1.0,
  confidence numeric not null default 0.5,
  frequency int not null default 1,
  last_reinforced_at timestamptz not null default now(),
  source text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint taste_signals_direction_check check (direction in ('positive', 'negative')),
  constraint taste_signals_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint taste_signals_frequency_check check (frequency >= 1),
  constraint taste_signals_weight_check check (weight >= 0)
);

create index if not exists taste_signals_user_direction_idx
  on public.taste_signals (user_id, direction);

create trigger taste_signals_set_updated_at
before update on public.taste_signals
for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- 5. session_context
-- ---------------------------------------------------------------------
create table if not exists public.session_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  content text not null,
  kind text not null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  reinforcement_count int not null default 1,

  created_at timestamptz not null default now(),

  constraint session_context_reinforcement_check check (reinforcement_count >= 1),
  constraint session_context_kind_check check (kind in ('mood', 'interest', 'plan', 'energy'))
);

create index if not exists session_context_user_expires_idx
  on public.session_context (user_id, expires_at);

-- Decay placeholder. A scheduled job (out of scope for this sprint) will:
--   delete from public.session_context where expires_at < now();
-- For now, callers can invoke clearExpiredSessionContext() via a server action.

-- ---------------------------------------------------------------------
-- 6. decision_runs
-- ---------------------------------------------------------------------
create table if not exists public.decision_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  ask_text text not null,
  intent text,
  plan_horizon text,
  context jsonb not null default '{}'::jsonb,

  candidates jsonb not null default '[]'::jsonb,
  filtered_out jsonb not null default '[]'::jsonb,
  taste_scores jsonb not null default '{}'::jsonb,
  upside_scores jsonb not null default '{}'::jsonb,

  recommendation jsonb,
  backup jsonb,
  reasoning text,

  user_action text,
  user_feedback text,
  refined_into uuid references public.decision_runs(id) on delete set null,

  created_at timestamptz not null default now(),

  constraint decision_runs_user_action_check check (
    user_action is null
    or user_action in ('saved', 'rejected', 'refined', 'felt_right', 'not_my_taste')
  )
);

create index if not exists decision_runs_user_created_idx
  on public.decision_runs (user_id, created_at desc);

-- =====================================================================
-- Row-level security
-- =====================================================================

alter table public.profiles            enable row level security;
alter table public.founder_profile     enable row level security;
alter table public.memory_items        enable row level security;
alter table public.taste_signals       enable row level security;
alter table public.session_context     enable row level security;
alter table public.decision_runs       enable row level security;

-- ---------------------------------------------------------------------
-- profiles policies
-- ---------------------------------------------------------------------

-- Self can read own row. Anyone authenticated can read 'owner' (demo) rows.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or app_role = 'owner'
);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists profiles_delete_self on public.profiles;
create policy profiles_delete_self on public.profiles
for delete
to authenticated
using (auth.uid() = id);

-- ---------------------------------------------------------------------
-- founder_profile policies
-- ---------------------------------------------------------------------
drop policy if exists founder_profile_select on public.founder_profile;
create policy founder_profile_select on public.founder_profile
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_demo_visible_user(user_id)
);

drop policy if exists founder_profile_insert on public.founder_profile;
create policy founder_profile_insert on public.founder_profile
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.is_app_owner(auth.uid())
);

drop policy if exists founder_profile_update on public.founder_profile;
create policy founder_profile_update on public.founder_profile
for update
to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists founder_profile_delete on public.founder_profile;
create policy founder_profile_delete on public.founder_profile
for delete
to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()));

-- ---------------------------------------------------------------------
-- memory_items policies
-- ---------------------------------------------------------------------
drop policy if exists memory_items_select on public.memory_items;
create policy memory_items_select on public.memory_items
for select
to authenticated
using (
  auth.uid() = user_id
  or (public.is_demo_visible_user(user_id) and status = 'active')
);

drop policy if exists memory_items_insert on public.memory_items;
create policy memory_items_insert on public.memory_items
for insert
to authenticated
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists memory_items_update on public.memory_items;
create policy memory_items_update on public.memory_items
for update
to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists memory_items_delete on public.memory_items;
create policy memory_items_delete on public.memory_items
for delete
to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()));

-- ---------------------------------------------------------------------
-- taste_signals policies
-- ---------------------------------------------------------------------
drop policy if exists taste_signals_select on public.taste_signals;
create policy taste_signals_select on public.taste_signals
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_demo_visible_user(user_id)
);

drop policy if exists taste_signals_insert on public.taste_signals;
create policy taste_signals_insert on public.taste_signals
for insert
to authenticated
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists taste_signals_update on public.taste_signals;
create policy taste_signals_update on public.taste_signals
for update
to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists taste_signals_delete on public.taste_signals;
create policy taste_signals_delete on public.taste_signals
for delete
to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()));

-- ---------------------------------------------------------------------
-- session_context policies (owner-only; viewers cannot create)
-- ---------------------------------------------------------------------
drop policy if exists session_context_select on public.session_context;
create policy session_context_select on public.session_context
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists session_context_insert on public.session_context;
create policy session_context_insert on public.session_context
for insert
to authenticated
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists session_context_update on public.session_context;
create policy session_context_update on public.session_context
for update
to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists session_context_delete on public.session_context;
create policy session_context_delete on public.session_context
for delete
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- decision_runs policies (owner-only writes; viewers can read demo)
-- ---------------------------------------------------------------------
drop policy if exists decision_runs_select on public.decision_runs;
create policy decision_runs_select on public.decision_runs
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_demo_visible_user(user_id)
);

drop policy if exists decision_runs_insert on public.decision_runs;
create policy decision_runs_insert on public.decision_runs
for insert
to authenticated
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists decision_runs_update on public.decision_runs;
create policy decision_runs_update on public.decision_runs
for update
to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists decision_runs_delete on public.decision_runs;
create policy decision_runs_delete on public.decision_runs
for delete
to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()));
