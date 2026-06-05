-- Phase 10: context engine + multimodal intake
--
-- Adds an observation/entity/audit trail for text, image, voice, and link intake.
-- Reuses surfaced_items for Radar candidates and tastemakers for monitored
-- sources instead of creating duplicate product concepts.

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null,
  raw_input_url text,
  extracted_text text,
  interpreted_type text,
  entities_json jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0.5,
  state text not null default 'observed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint observations_source_type_check check (
    source_type in ('image', 'voice', 'text', 'manual', 'link')
  ),
  constraint observations_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint observations_state_check check (
    state in (
      'observed',
      'recognized',
      'researched',
      'radar_candidate',
      'saved_to_radar',
      'planning_requested',
      'planning_in_progress',
      'planned',
      'cancelled'
    )
  )
);

create index if not exists observations_user_created_idx
  on public.observations (user_id, created_at desc);
create index if not exists observations_user_state_idx
  on public.observations (user_id, state, updated_at desc);
create index if not exists observations_user_type_idx
  on public.observations (user_id, source_type, interpreted_type);

drop trigger if exists observations_set_updated_at on public.observations;
create trigger observations_set_updated_at
before update on public.observations
for each row execute function public.tg_set_updated_at();

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  name text not null,
  canonical_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0.5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entities_type_check check (
    type in (
      'place',
      'person',
      'source',
      'event',
      'brand',
      'dish',
      'neighborhood',
      'document',
      'material',
      'product',
      'other'
    )
  ),
  constraint entities_confidence_check check (confidence >= 0 and confidence <= 1)
);

create unique index if not exists entities_user_type_canonical_idx
  on public.entities (user_id, type, canonical_name);
create index if not exists entities_user_created_idx
  on public.entities (user_id, created_at desc);

drop trigger if exists entities_set_updated_at on public.entities;
create trigger entities_set_updated_at
before update on public.entities
for each row execute function public.tg_set_updated_at();

create table if not exists public.observation_entities (
  observation_id uuid not null references public.observations(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'mentioned',
  created_at timestamptz not null default now(),
  primary key (observation_id, entity_id, role),
  constraint observation_entities_role_check check (
    role in ('mentioned', 'primary_subject', 'source', 'location', 'related')
  )
);

create index if not exists observation_entities_user_idx
  on public.observation_entities (user_id, created_at desc);
create index if not exists observation_entities_entity_idx
  on public.observation_entities (entity_id);

create table if not exists public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null,
  input_observation_id uuid references public.observations(id) on delete set null,
  target_table text,
  target_id text,
  confidence numeric,
  reasoning_summary text,
  was_user_confirmed boolean not null default false,
  state_before text,
  state_after text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ai_actions_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  )
);

create index if not exists ai_actions_user_created_idx
  on public.ai_actions (user_id, created_at desc);
create index if not exists ai_actions_observation_idx
  on public.ai_actions (input_observation_id);
create index if not exists ai_actions_target_idx
  on public.ai_actions (target_table, target_id);

alter table public.behavior_signals
  add column if not exists object_type text,
  add column if not exists object_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists behavior_signals_user_object_idx
  on public.behavior_signals (user_id, object_type, object_id, created_at desc);

alter table public.surfaced_items
  add column if not exists source_observation_id uuid references public.observations(id) on delete set null,
  add column if not exists confidence numeric,
  add column if not exists taste_fit_summary text,
  add column if not exists planning_state text not null default 'observed';

alter table public.surfaced_items
  drop constraint if exists surfaced_items_confidence_check;
alter table public.surfaced_items
  add constraint surfaced_items_confidence_check check (
    confidence is null or (confidence >= 0 and confidence <= 1)
  );

alter table public.surfaced_items
  drop constraint if exists surfaced_items_planning_state_check;
alter table public.surfaced_items
  add constraint surfaced_items_planning_state_check check (
    planning_state in (
      'observed',
      'recognized',
      'researched',
      'radar_candidate',
      'saved_to_radar',
      'planning_requested',
      'planning_in_progress',
      'planned',
      'cancelled'
    )
  );

create index if not exists surfaced_items_source_observation_idx
  on public.surfaced_items (source_observation_id)
  where source_observation_id is not null;
create index if not exists surfaced_items_user_planning_state_idx
  on public.surfaced_items (user_id, planning_state, updated_at desc);

alter table public.plans
  add column if not exists cancelled_at timestamptz,
  add column if not exists source_observation_id uuid references public.observations(id) on delete set null;

create index if not exists plans_source_observation_idx
  on public.plans (source_observation_id)
  where source_observation_id is not null;

alter table public.observations enable row level security;
alter table public.entities enable row level security;
alter table public.observation_entities enable row level security;
alter table public.ai_actions enable row level security;

drop policy if exists observations_owner_all on public.observations;
create policy observations_owner_all on public.observations
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists entities_owner_all on public.entities;
create policy entities_owner_all on public.entities
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists observation_entities_owner_all on public.observation_entities;
create policy observation_entities_owner_all on public.observation_entities
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists ai_actions_owner_all on public.ai_actions;
create policy ai_actions_owner_all on public.ai_actions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Seed the existing source system with a trusted Chicago discovery account.
-- Future users receive the same source through seed_founder_for in seed.sql.
insert into public.tastemakers (
  user_id,
  name,
  role,
  notes,
  instagram_handle,
  website_url
)
select
  p.id,
  'Chicago Explore',
  'curator',
  'Manually seeded Phase 10 source. Quality Chicago discovery account for restaurants, culture, and hidden spots.',
  'chicagoexplore',
  'https://www.instagram.com/chicagoexplore/'
from public.profiles p
where p.app_role = 'owner'
  and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tastemakers'
  )
  and not exists (
    select 1 from public.tastemakers t
    where t.user_id = p.id
      and lower(coalesce(t.instagram_handle, '')) = 'chicagoexplore'
  );
