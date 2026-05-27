-- Phase 4: Event Pulse + Tastemaker Tracking
-- Migration 0007

-- ── current_events ────────────────────────────────────────────────────────────
-- Rolling window of upcoming events discovered by the Event Scout or
-- surfaced via Drop It In / tastemaker sweep.

create table if not exists current_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  title             text not null,
  slug              text,
  event_type        text check (event_type in (
                      'dj_set','live_music','chef_dinner','wine_event',
                      'art_opening','comedy','speaker','other'
                    )),
  venue_name        text not null,
  library_place_id  uuid references places_library(id) on delete set null,
  named_entities    text[] not null default '{}',
  starts_at         timestamptz not null,
  ends_at           timestamptz,
  ticket_url        text,
  price_level       text,
  vibe_keywords     text[] not null default '{}',
  description       text,
  sources_cited     jsonb,
  verdict           text,
  verdict_strength  numeric,
  discovered_at     timestamptz not null default now(),
  discovered_via    text,
  status            text not null default 'pending'
                      check (status in ('pending','verified','surfaced','expired','rejected')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists current_events_user_starts
  on current_events (user_id, starts_at);
create index if not exists current_events_user_status
  on current_events (user_id, status);

-- RLS
alter table current_events enable row level security;

create policy "owner_select_current_events" on current_events
  for select using (auth.uid() = user_id);
create policy "owner_insert_current_events" on current_events
  for insert with check (auth.uid() = user_id);
create policy "owner_update_current_events" on current_events
  for update using (auth.uid() = user_id);
create policy "owner_delete_current_events" on current_events
  for delete using (auth.uid() = user_id);

-- ── tastemakers ───────────────────────────────────────────────────────────────
-- Trusted humans whose activity is monitored by the tastemaker sweep.

create table if not exists tastemakers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  name              text not null,
  role              text check (role in (
                      'promoter','dj','chef','writer','venue_owner',
                      'curator','friend_in_the_scene'
                    )),
  notes             text,
  instagram_handle  text,
  website_url       text,
  newsletter_url    text,
  ra_url            text,
  soundcloud_url    text,
  bandcamp_url      text,
  linktree_url      text,
  other_urls        text[] not null default '{}',
  last_checked_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists tastemakers_user_last_checked
  on tastemakers (user_id, last_checked_at nulls first);

-- RLS
alter table tastemakers enable row level security;

create policy "owner_select_tastemakers" on tastemakers
  for select using (auth.uid() = user_id);
create policy "owner_insert_tastemakers" on tastemakers
  for insert with check (auth.uid() = user_id);
create policy "owner_update_tastemakers" on tastemakers
  for update using (auth.uid() = user_id);
create policy "owner_delete_tastemakers" on tastemakers
  for delete using (auth.uid() = user_id);
