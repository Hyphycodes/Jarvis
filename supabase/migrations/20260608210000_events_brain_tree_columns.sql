-- Events engine brain tree: extend current_events into the events warehouse with
-- sub-library + the Truth/Taste/Fit/Urgency/Planability assessment layers + scores
-- + expiration. All nullable/additive — no data loss, reuses the existing table
-- (the spec prefers reuse over four physical sub-library tables).
alter table public.current_events
  add column if not exists sub_library text,
  add column if not exists neighborhood text,
  add column if not exists venue_address text,
  add column if not exists image_url text,
  add column if not exists timezone text,
  add column if not exists price_min integer,
  add column if not exists price_max integer,
  add column if not exists external_id text,
  add column if not exists taste_vector jsonb,
  add column if not exists truth_assessment jsonb,
  add column if not exists fit_assessment jsonb,
  add column if not exists urgency_assessment jsonb,
  add column if not exists planability_assessment jsonb,
  add column if not exists pre_score numeric,
  add column if not exists final_score numeric,
  add column if not exists comparative_rank integer,
  add column if not exists expires_at timestamptz,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists rejection_stage text,
  add column if not exists rejection_reason text,
  add column if not exists plan_id uuid;

create index if not exists current_events_sub_library_idx
  on public.current_events (user_id, sub_library, status);
create index if not exists current_events_expires_at_idx
  on public.current_events (user_id, expires_at);

-- Backfill sub_library from the existing event_type so the lane is immediately
-- segmented; 'other' + nulls re-classify on the next scout pass.
update public.current_events set sub_library =
  case
    when event_type in ('dj_set','live_music') then 'events_music'
    when event_type in ('wine_event','chef_dinner') then 'events_food'
    when event_type in ('art_opening') then 'events_art'
    else null
  end
where sub_library is null;

-- Backfill expiration: end+24h, else start+24h.
update public.current_events
  set expires_at = coalesce(ends_at, starts_at) + interval '24 hours'
where expires_at is null and starts_at is not null;
