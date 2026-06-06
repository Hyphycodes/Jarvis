-- Radar jobs queue — persistent work queue for per-lane background processing.
-- Rows are claimed by a worker (locked_at/locked_by), processed, then updated to
-- 'done' or 'failed'. run_id links back to radar_autopilot_runs when applicable.

create table if not exists public.radar_jobs (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profiles(id) on delete cascade,
  lane           text        not null,
  stage          text        not null,
  status         text        not null default 'queued',
  priority       integer     not null default 100,
  attempts       integer     not null default 0,
  max_attempts   integer     not null default 3,
  payload        jsonb       not null default '{}',
  result         jsonb,
  error_message  text,
  scheduled_for  timestamptz not null default now(),
  locked_at      timestamptz,
  locked_by      text,
  run_id         uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Claim index: workers pick the oldest queued job by priority
create index if not exists radar_jobs_claim_idx
  on public.radar_jobs (status, scheduled_for, priority);

-- Per-user / per-lane status lookups
create index if not exists radar_jobs_user_lane_idx
  on public.radar_jobs (user_id, lane, status);

-- updated_at trigger (re-uses the shared helper)
drop trigger if exists radar_jobs_set_updated_at on public.radar_jobs;
create trigger radar_jobs_set_updated_at
  before update on public.radar_jobs
  for each row execute function public.tg_set_updated_at();
