-- Places engine warehouse (per jarvis-places-engine-brain-tree.md). New dedicated
-- table rather than extending the mixed/coupled places_library (which holds
-- restaurants/culture/events too). The scout SEEDS from places_library's
-- place-category rows. Places are EVERGREEN — no expires_at.
create table if not exists public.places_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  external_id text,
  source text,
  source_url text,
  library_place_id uuid,
  title text not null,
  description text,
  place_type text,
  sub_library text not null default 'places_venues',
  sub_type text,
  neighborhood text,
  address text,
  lat double precision,
  lng double precision,
  google_place_id text,
  image_url text,
  photo_urls jsonb,
  hours jsonb,
  vibe_keywords text[] default '{}',
  best_for text[] default '{}',
  verdict text,
  verdict_strength numeric,
  quality_score numeric,
  primary_role text,
  secondary_roles jsonb,
  best_use_case text,
  taste_vector jsonb,
  truth_assessment jsonb,
  fit_assessment jsonb,
  role_assessment jsonb,
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

create unique index if not exists places_items_user_external_key
  on public.places_items (user_id, external_id) where external_id is not null;
create index if not exists places_items_user_sub_status_idx
  on public.places_items (user_id, sub_library, status);
create index if not exists places_items_user_final_idx
  on public.places_items (user_id, final_score desc nulls last);

alter table public.places_items enable row level security;
create policy places_items_owner_select on public.places_items
  for select using (auth.uid() = user_id);
create policy places_items_owner_insert on public.places_items
  for insert with check (auth.uid() = user_id);
create policy places_items_owner_update on public.places_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger places_items_set_updated_at
  before update on public.places_items
  for each row execute function public.tg_set_updated_at();
