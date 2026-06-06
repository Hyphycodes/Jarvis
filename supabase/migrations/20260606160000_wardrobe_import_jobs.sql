-- Wardrobe import jobs — durable background queue for closet photo intake.
--
-- When the owner uploads outfit/closet photos in chat, the request enqueues a
-- job here (status='queued') with the photos uploaded to the `wardrobe-intake`
-- storage bucket, then returns an instant acknowledgment. A worker (kicked off
-- immediately via after(), with a cron backstop) claims the job, runs garment
-- extraction + dedup + save through ingestWardrobePhotos, writes a simple
-- summary, and notifies via web-push. Mirrors the radar_jobs claim/lock pattern.

create table if not exists public.wardrobe_import_jobs (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profiles(id) on delete cascade,
  status         text        not null default 'queued',  -- queued | processing | done | failed
  context_note   text,
  photo_paths    jsonb       not null default '[]',       -- storage keys in `wardrobe-intake`
  photo_count    integer     not null default 0,
  attempts       integer     not null default 0,
  max_attempts   integer     not null default 3,
  result         jsonb,                                   -- { created, merged, skipped, clarifications, created_item_ids[], items[] }
  summary_text   text,
  error_message  text,
  locked_at      timestamptz,
  locked_by      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Claim index: worker picks the oldest queued job
create index if not exists wardrobe_import_jobs_claim_idx
  on public.wardrobe_import_jobs (status, created_at);

-- Per-user status lookups (client polling)
create index if not exists wardrobe_import_jobs_user_status_idx
  on public.wardrobe_import_jobs (user_id, status);

alter table public.wardrobe_import_jobs enable row level security;

drop policy if exists "owner access wardrobe import jobs" on public.wardrobe_import_jobs;
create policy "owner access wardrobe import jobs"
  on public.wardrobe_import_jobs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists wardrobe_import_jobs_set_updated_at on public.wardrobe_import_jobs;
create trigger wardrobe_import_jobs_set_updated_at
  before update on public.wardrobe_import_jobs
  for each row execute function public.tg_set_updated_at();

-- Private storage bucket for staged intake photos (worker deletes after success).
insert into storage.buckets (id, name, public)
values ('wardrobe-intake', 'wardrobe-intake', false)
on conflict (id) do nothing;
