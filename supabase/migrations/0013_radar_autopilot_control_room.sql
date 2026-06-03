-- Sprint 12.2: Radar Autopilot run state and control flags

create table if not exists public.radar_autopilot_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  paused_at timestamptz,
  paused_reason text,
  stop_requested_at timestamptz,
  stop_requested_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.radar_autopilot_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null
    check (mode in ('scheduled','bootstrap','owner_requested','manual_force')),
  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','paused','cancelled','blocked')),
  operation text,
  operations_run jsonb not null default '[]',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  last_heartbeat_at timestamptz,
  summary text,
  provider_status jsonb not null default '{}',
  missing_providers jsonb not null default '[]',
  counts_before jsonb not null default '{}',
  counts_after jsonb not null default '{}',
  candidates_created integer not null default 0,
  library_items_created integer not null default 0,
  sources_created integer not null default 0,
  candidates_held integer not null default 0,
  candidates_promoted integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists radar_autopilot_runs_user_started_idx
  on public.radar_autopilot_runs (user_id, started_at desc);
create index if not exists radar_autopilot_runs_user_status_idx
  on public.radar_autopilot_runs (user_id, status, started_at desc);

create table if not exists public.radar_autopilot_activity (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.radar_autopilot_runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  level text not null default 'info'
    check (level in ('info','success','warning','error')),
  message text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists radar_autopilot_activity_user_created_idx
  on public.radar_autopilot_activity (user_id, created_at desc);
create index if not exists radar_autopilot_activity_run_created_idx
  on public.radar_autopilot_activity (run_id, created_at desc);

alter table public.radar_autopilot_settings enable row level security;
alter table public.radar_autopilot_runs enable row level security;
alter table public.radar_autopilot_activity enable row level security;

drop policy if exists radar_autopilot_settings_owner_all on public.radar_autopilot_settings;
create policy radar_autopilot_settings_owner_all on public.radar_autopilot_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists radar_autopilot_runs_owner_all on public.radar_autopilot_runs;
create policy radar_autopilot_runs_owner_all on public.radar_autopilot_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists radar_autopilot_activity_owner_all on public.radar_autopilot_activity;
create policy radar_autopilot_activity_owner_all on public.radar_autopilot_activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
