-- Moves engine warehouse (per jarvis-moves-engine-brain-tree.md). Moves are
-- GENERATED executable actions (not scouted), EVERGREEN (pause, don't expire), with
-- a sequence + gear and Energy/Weather brains. One table + sub_library/sub_type.
create table if not exists public.moves_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  external_id text,
  source text,
  source_url text,
  title text not null,
  description text,
  sub_library text not null default 'moves_outdoor',
  sub_type text,
  move_kind text,
  activity_type text,
  location_name text,
  neighborhood text,
  suggested_window text,
  duration_minutes integer,
  price_hint text,
  booking_url text,
  image_url text,
  sequence jsonb,
  gear_needed jsonb,
  prep_notes jsonb,
  north_pillars text[] default '{}',
  vibe_keywords text[] default '{}',
  verdict text,
  verdict_strength numeric,
  taste_vector jsonb,
  truth_assessment jsonb,
  fit_assessment jsonb,
  energy_assessment jsonb,
  weather_assessment jsonb,
  planability_assessment jsonb,
  pre_score numeric,
  final_score numeric,
  comparative_rank integer,
  status text not null default 'discovered',
  rejection_stage text,
  rejection_reason text,
  plan_id uuid,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists moves_items_user_external_key
  on public.moves_items (user_id, external_id) where external_id is not null;
create index if not exists moves_items_user_sub_status_idx
  on public.moves_items (user_id, sub_library, status);
create index if not exists moves_items_user_final_idx
  on public.moves_items (user_id, final_score desc nulls last);

alter table public.moves_items enable row level security;
create policy moves_items_owner_select on public.moves_items
  for select using (auth.uid() = user_id);
create policy moves_items_owner_insert on public.moves_items
  for insert with check (auth.uid() = user_id);
create policy moves_items_owner_update on public.moves_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger moves_items_set_updated_at
  before update on public.moves_items
  for each row execute function public.tg_set_updated_at();
