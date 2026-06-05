-- Sprint 12: Radar Autopilot + Source Graph + Candidate Inbox

create table if not exists public.radar_candidate_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid,
  campaign_id text,
  title text not null,
  description text,
  url text,
  image_url text,
  entity_type text not null default 'other'
    check (entity_type in (
      'place',
      'event',
      'source',
      'person',
      'organization',
      'neighborhood',
      'recurring_signal',
      'opportunity',
      'other'
    )),
  raw_payload jsonb not null default '{}',
  discovered_at timestamptz not null default now(),
  evaluated_at timestamptz,
  status text not null default 'new'
    check (status in (
      'new',
      'evaluated',
      'library',
      'held',
      'promoted',
      'rejected',
      'duplicate',
      'stale'
    )),
  score numeric check (score is null or (score >= 0 and score <= 1)),
  reason jsonb,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint radar_candidate_inbox_user_url unique (user_id, url)
);

create index if not exists radar_candidate_inbox_user_status_idx
  on public.radar_candidate_inbox (user_id, status, discovered_at desc);
create index if not exists radar_candidate_inbox_user_entity_idx
  on public.radar_candidate_inbox (user_id, entity_type, discovered_at desc);

alter table public.radar_candidate_inbox enable row level security;

drop policy if exists radar_candidate_inbox_owner_all on public.radar_candidate_inbox;
create policy radar_candidate_inbox_owner_all on public.radar_candidate_inbox
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.intelligence_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_key text not null,
  source_type text not null default 'other'
    check (source_type in (
      'publication',
      'domain',
      'venue',
      'calendar',
      'newsletter',
      'tastemaker',
      'organizer',
      'search_pattern',
      'author',
      'restaurant_group',
      'cultural_institution',
      'community_group',
      'other'
    )),
  url text,
  domain text,
  name text,
  city text,
  topics text[] not null default '{}',
  trust_score numeric not null default 0.5 check (trust_score >= 0 and trust_score <= 1),
  taste_fit_score numeric not null default 0.5 check (taste_fit_score >= 0 and taste_fit_score <= 1),
  novelty_score numeric not null default 0.5 check (novelty_score >= 0 and novelty_score <= 1),
  freshness_score numeric not null default 0.5 check (freshness_score >= 0 and freshness_score <= 1),
  save_rate numeric not null default 0 check (save_rate >= 0 and save_rate <= 1),
  pass_rate numeric not null default 0 check (pass_rate >= 0 and pass_rate <= 1),
  plan_rate numeric not null default 0 check (plan_rate >= 0 and plan_rate <= 1),
  duplicate_rate numeric not null default 0 check (duplicate_rate >= 0 and duplicate_rate <= 1),
  total_candidates integer not null default 0,
  total_library_items integer not null default 0,
  total_promoted integer not null default 0,
  total_saved integer not null default 0,
  total_passed integer not null default 0,
  total_planned integer not null default 0,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  cadence_hours integer not null default 48,
  status text not null default 'testing'
    check (status in ('testing','watching','cooldown','muted','retired')),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intelligence_sources_user_key unique (user_id, source_key)
);

create index if not exists intelligence_sources_due_idx
  on public.intelligence_sources (user_id, status, next_check_at);
create index if not exists intelligence_sources_domain_idx
  on public.intelligence_sources (user_id, domain);

alter table public.intelligence_sources enable row level security;

drop policy if exists intelligence_sources_owner_all on public.intelligence_sources;
create policy intelligence_sources_owner_all on public.intelligence_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.places_library
  add column if not exists quality_tier text
    check (quality_tier is null or quality_tier in ('A','B','C','muted','rejected')),
  add column if not exists quality_score numeric
    check (quality_score is null or (quality_score >= 0 and quality_score <= 1)),
  add column if not exists next_refresh_at timestamptz,
  add column if not exists source_id uuid references public.intelligence_sources(id) on delete set null;

create index if not exists places_library_quality_idx
  on public.places_library (user_id, quality_tier, quality_score desc);
create index if not exists places_library_next_refresh_idx
  on public.places_library (user_id, next_refresh_at)
  where next_refresh_at is not null;

alter table public.current_events
  add column if not exists quality_tier text
    check (quality_tier is null or quality_tier in ('A','B','C','muted','rejected')),
  add column if not exists quality_score numeric
    check (quality_score is null or (quality_score >= 0 and quality_score <= 1)),
  add column if not exists source_id uuid references public.intelligence_sources(id) on delete set null;

create index if not exists current_events_quality_idx
  on public.current_events (user_id, quality_tier, quality_score desc);
