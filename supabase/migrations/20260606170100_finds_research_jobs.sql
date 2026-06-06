-- Finds research jobs — durable background queue for product/acquisition research.
--
-- When the owner asks for something to buy ("find me a better camera bag") in
-- chat/voice, the request enqueues a job here (status='queued') and returns an
-- instant acknowledgment. A worker (kicked off immediately via after(), with a
-- cron backstop) claims the job, runs the Product Researcher through createFind
-- (or refineFind), writes the resulting surfaced_items find id, and notifies via
-- web-push. Not-ready finds are retried on subsequent drains until they reach a
-- presentable "ready" state or max_attempts is hit. Mirrors wardrobe_import_jobs.

create table if not exists public.finds_research_jobs (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profiles(id) on delete cascade,
  status         text        not null default 'queued',  -- queued | processing | done | failed
  mission        text        not null,
  context        text,
  source         text        not null default 'user_intent', -- user_intent | need_scout | finds
  source_brain   text,                                    -- style | gear | home | travel | hosting | fitness
  refine         text,                                    -- set when this job refines an existing find
  item_id        uuid,                                    -- surfaced_items id of the resulting find
  attempts       integer     not null default 0,
  max_attempts   integer     not null default 3,
  result         jsonb,                                   -- { ready, best_pick_name, research_state }
  summary_text   text,
  error_message  text,
  locked_at      timestamptz,
  locked_by      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Claim index: worker picks the oldest queued/retryable job
create index if not exists finds_research_jobs_claim_idx
  on public.finds_research_jobs (status, created_at);

-- Per-user status lookups (client polling)
create index if not exists finds_research_jobs_user_status_idx
  on public.finds_research_jobs (user_id, status);

alter table public.finds_research_jobs enable row level security;

drop policy if exists "owner access finds research jobs" on public.finds_research_jobs;
create policy "owner access finds research jobs"
  on public.finds_research_jobs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists finds_research_jobs_set_updated_at on public.finds_research_jobs;
create trigger finds_research_jobs_set_updated_at
  before update on public.finds_research_jobs
  for each row execute function public.tg_set_updated_at();
