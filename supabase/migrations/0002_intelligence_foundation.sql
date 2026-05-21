-- =====================================================================
-- Jarvis · intelligence routing + memory foundation
-- Migration 0002: additive intelligence tables, proposal-first memory,
-- semantic recall readiness
-- =====================================================================

create extension if not exists "vector";

-- ---------------------------------------------------------------------
-- Extend canonical memory_items without forking memory.
-- ---------------------------------------------------------------------
alter table public.memory_items
  add column if not exists last_used_at timestamptz,
  add column if not exists usage_count int not null default 0,
  add column if not exists tags text[] not null default '{}',
  add column if not exists embedding vector;

alter table public.memory_items
  drop constraint if exists memory_items_kind_check;
alter table public.memory_items
  add constraint memory_items_kind_check check (
    kind in (
      'identity',
      'preference',
      'pattern',
      'principle',
      'context',
      'taste',
      'avoidance',
      'decision_rule',
      'relationship',
      'north_goal',
      'place_history',
      'event_history',
      'confirmed_behavior'
    )
  );

alter table public.memory_items
  drop constraint if exists memory_items_status_check;
alter table public.memory_items
  add constraint memory_items_status_check check (
    status in ('active', 'pending', 'rejected', 'archived', 'fading')
  );

create index if not exists memory_items_user_kind_idx
  on public.memory_items (user_id, kind);
create index if not exists memory_items_user_tags_idx
  on public.memory_items using gin (tags);

-- ---------------------------------------------------------------------
-- Proposal-first memory.
-- ---------------------------------------------------------------------
create table if not exists public.memory_update_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  memory_type text not null,
  content text not null,
  confidence numeric not null default 0.5,
  should_save boolean not null default true,
  reason text not null,
  evidence text[] not null default '{}',
  requires_user_approval boolean not null default true,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memory_update_proposals_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint memory_update_proposals_type_check check (
    memory_type in (
      'taste',
      'avoidance',
      'decision_rule',
      'relationship',
      'north_goal',
      'place_history',
      'event_history',
      'confirmed_behavior'
    )
  ),
  constraint memory_update_proposals_status_check check (status in ('pending', 'accepted', 'rejected'))
);

create index if not exists memory_update_proposals_user_status_idx
  on public.memory_update_proposals (user_id, status, created_at desc);

drop trigger if exists memory_update_proposals_set_updated_at on public.memory_update_proposals;
create trigger memory_update_proposals_set_updated_at
before update on public.memory_update_proposals
for each row execute function public.tg_set_updated_at();

create table if not exists public.behavior_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  signal_type text not null,
  subject_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists behavior_signals_user_created_idx
  on public.behavior_signals (user_id, created_at desc);
create index if not exists behavior_signals_user_type_idx
  on public.behavior_signals (user_id, signal_type);

-- ---------------------------------------------------------------------
-- Surfaced intelligence and screen state.
-- ---------------------------------------------------------------------
create table if not exists public.surfaced_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  destination text not null,
  source text not null default 'system',
  payload jsonb not null default '{}'::jsonb,
  score numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surfaced_items_user_destination_idx
  on public.surfaced_items (user_id, destination, created_at desc);
drop trigger if exists surfaced_items_set_updated_at on public.surfaced_items;
create trigger surfaced_items_set_updated_at
before update on public.surfaced_items
for each row execute function public.tg_set_updated_at();

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text,
  date text,
  location_line text,
  summary text,
  live_enabled boolean not null default false,
  live_label text not null default 'BEGIN',
  key_stats jsonb not null default '{}'::jsonb,
  quote_card jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_live_label_check check (live_label in ('LIVE', 'BEGIN', 'UPCOMING'))
);

create index if not exists plans_user_status_idx
  on public.plans (user_id, status, updated_at desc);
drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.tg_set_updated_at();

create table if not exists public.plan_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  section_id text not null,
  title text not null,
  subtitle text,
  icon text,
  content jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plan_sections_plan_order_idx
  on public.plan_sections (plan_id, sort_order);
drop trigger if exists plan_sections_set_updated_at on public.plan_sections;
create trigger plan_sections_set_updated_at
before update on public.plan_sections
for each row execute function public.tg_set_updated_at();

create table if not exists public.today_timeline_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  time text not null,
  title text not null,
  status text not null default 'pending',
  expandable boolean not null default false,
  details text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint today_timeline_items_status_check check (status in ('pending', 'active', 'done', 'skipped'))
);

create index if not exists today_timeline_items_user_order_idx
  on public.today_timeline_items (user_id, sort_order);
drop trigger if exists today_timeline_items_set_updated_at on public.today_timeline_items;
create trigger today_timeline_items_set_updated_at
before update on public.today_timeline_items
for each row execute function public.tg_set_updated_at();

create table if not exists public.circle_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null,
  role text,
  closeness_score numeric not null default 0.5,
  last_interaction text,
  next_action text,
  current_thread text,
  notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_people_closeness_check check (closeness_score >= 0 and closeness_score <= 1)
);

create index if not exists circle_people_user_category_idx
  on public.circle_people (user_id, category);
drop trigger if exists circle_people_set_updated_at on public.circle_people;
create trigger circle_people_set_updated_at
before update on public.circle_people
for each row execute function public.tg_set_updated_at();

create table if not exists public.circle_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  person_id uuid references public.circle_people(id) on delete set null,
  title text not null,
  summary text not null,
  suggested_action text,
  urgency text not null default 'low',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circle_updates_urgency_check check (urgency in ('low', 'medium', 'high'))
);

create index if not exists circle_updates_user_created_idx
  on public.circle_updates (user_id, created_at desc);
drop trigger if exists circle_updates_set_updated_at on public.circle_updates;
create trigger circle_updates_set_updated_at
before update on public.circle_updates
for each row execute function public.tg_set_updated_at();

create table if not exists public.north_pillars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  progress numeric,
  active_signals text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint north_pillars_progress_check check (progress is null or (progress >= 0 and progress <= 1))
);

create index if not exists north_pillars_user_idx
  on public.north_pillars (user_id, updated_at desc);
drop trigger if exists north_pillars_set_updated_at on public.north_pillars;
create trigger north_pillars_set_updated_at
before update on public.north_pillars
for each row execute function public.tg_set_updated_at();

create table if not exists public.north_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pillar_id uuid references public.north_pillars(id) on delete set null,
  title text not null,
  summary text not null,
  action text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists north_signals_user_created_idx
  on public.north_signals (user_id, created_at desc);
drop trigger if exists north_signals_set_updated_at on public.north_signals;
create trigger north_signals_set_updated_at
before update on public.north_signals
for each row execute function public.tg_set_updated_at();

-- =====================================================================
-- Row-level security for new tables: owner owns their private layer.
-- =====================================================================
alter table public.memory_update_proposals enable row level security;
alter table public.behavior_signals enable row level security;
alter table public.surfaced_items enable row level security;
alter table public.plans enable row level security;
alter table public.plan_sections enable row level security;
alter table public.today_timeline_items enable row level security;
alter table public.circle_people enable row level security;
alter table public.circle_updates enable row level security;
alter table public.north_pillars enable row level security;
alter table public.north_signals enable row level security;

drop policy if exists memory_update_proposals_owner_all on public.memory_update_proposals;
create policy memory_update_proposals_owner_all on public.memory_update_proposals
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists behavior_signals_owner_all on public.behavior_signals;
create policy behavior_signals_owner_all on public.behavior_signals
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists surfaced_items_owner_all on public.surfaced_items;
create policy surfaced_items_owner_all on public.surfaced_items
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists plans_owner_all on public.plans;
create policy plans_owner_all on public.plans
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists plan_sections_owner_all on public.plan_sections;
create policy plan_sections_owner_all on public.plan_sections
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists today_timeline_items_owner_all on public.today_timeline_items;
create policy today_timeline_items_owner_all on public.today_timeline_items
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists circle_people_owner_all on public.circle_people;
create policy circle_people_owner_all on public.circle_people
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists circle_updates_owner_all on public.circle_updates;
create policy circle_updates_owner_all on public.circle_updates
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists north_pillars_owner_all on public.north_pillars;
create policy north_pillars_owner_all on public.north_pillars
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));

drop policy if exists north_signals_owner_all on public.north_signals;
create policy north_signals_owner_all on public.north_signals
for all to authenticated
using (auth.uid() = user_id and public.is_app_owner(auth.uid()))
with check (auth.uid() = user_id and public.is_app_owner(auth.uid()));
