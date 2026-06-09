-- Culture engine warehouse (per jarvis-culture-engine-brain-tree.md). Culture is
-- mostly TIMELESS (dated culture → Events), so unlike current_events the dates are
-- nullable and is_dated gates expiration. One table, sub_library column (no per-
-- sub-library physical tables — nothing existing fits timeless culture programs).
create table if not exists public.culture_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  external_id text,
  source text,
  source_url text,
  discovered_via text,
  title text not null,
  description text,
  venue_name text,
  institution_name text,
  venue_address text,
  neighborhood text,
  sub_library text not null default 'culture_exhibits',
  sub_type text,
  is_dated boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  image_url text,
  admission_price_min integer,
  admission_price_max integer,
  vibe_keywords text[] default '{}',
  verdict text,
  verdict_strength numeric,
  quality_score numeric,
  taste_vector jsonb,
  truth_assessment jsonb,
  fit_assessment jsonb,
  depth_assessment jsonb,
  planability_assessment jsonb,
  pre_score numeric,
  final_score numeric,
  comparative_rank integer,
  status text not null default 'discovered',
  rejection_stage text,
  rejection_reason text,
  plan_id uuid,
  expires_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists culture_items_user_external_key
  on public.culture_items (user_id, external_id) where external_id is not null;
create index if not exists culture_items_user_sub_status_idx
  on public.culture_items (user_id, sub_library, status);
create index if not exists culture_items_user_final_idx
  on public.culture_items (user_id, final_score desc nulls last);

alter table public.culture_items enable row level security;
drop policy if exists culture_items_owner_select on public.culture_items;
create policy culture_items_owner_select on public.culture_items
  for select using (auth.uid() = user_id);
drop policy if exists culture_items_owner_insert on public.culture_items;
create policy culture_items_owner_insert on public.culture_items
  for insert with check (auth.uid() = user_id);
drop policy if exists culture_items_owner_update on public.culture_items;
create policy culture_items_owner_update on public.culture_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists culture_items_set_updated_at on public.culture_items;
create trigger culture_items_set_updated_at
  before update on public.culture_items
  for each row execute function public.tg_set_updated_at();
