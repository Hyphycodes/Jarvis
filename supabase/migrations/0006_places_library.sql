-- Place candidates: raw leads before research
create table if not exists place_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  discovered_via text,
  discovered_at timestamptz not null default now(),
  status text not null default 'pending',
  notes text,
  quick_classification text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists place_candidates_user_status
  on place_candidates (user_id, status);

alter table place_candidates enable row level security;

create policy "owner_all_place_candidates" on place_candidates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Places library: researched entries with dossier and verdict
create table if not exists places_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  slug text not null,
  place_type text,
  neighborhood text,
  address text,
  lat double precision,
  lng double precision,
  cuisine_or_focus text,
  price_level text,
  hours_summary text,
  vibe_keywords text[] not null default '{}',
  sources_cited jsonb not null default '[]',
  verdict text,
  verdict_strength numeric,
  best_for text[] not null default '{}',
  not_for text[] not null default '{}',
  compared_to text,
  events_observed jsonb not null default '[]',
  seasonal_notes text,
  first_seen_at timestamptz not null default now(),
  last_researched_at timestamptz not null default now(),
  last_refreshed_at timestamptz not null default now(),
  times_surfaced integer not null default 0,
  last_surfaced_at timestamptz,
  user_feedback_signal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint places_library_user_slug unique (user_id, slug)
);

create index if not exists places_library_user_type
  on places_library (user_id, place_type);

create index if not exists places_library_user_surfaced
  on places_library (user_id, last_surfaced_at);

alter table places_library enable row level security;

create policy "owner_all_places_library" on places_library
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
