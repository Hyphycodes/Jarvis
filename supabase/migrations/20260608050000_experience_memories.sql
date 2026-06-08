-- Experience Memory Engine v1: structured memory of how a plan actually went,
-- captured in the AFTER chapter and read back by curation/council as taste signal.
create table if not exists public.experience_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid,
  source_item_id uuid,
  lane text,
  venue_name text,
  rating text not null check (rating in ('loved','good','meh','not_for_me')),
  would_return boolean,
  companions text[],
  spend_amount numeric,
  notes text,
  photo_urls text[],
  taste_signal jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One memory per plan and per source item (the action upserts on these).
create unique index if not exists experience_memories_user_plan_key
  on public.experience_memories (user_id, plan_id) where plan_id is not null;
create unique index if not exists experience_memories_user_item_key
  on public.experience_memories (user_id, source_item_id) where source_item_id is not null;
create index if not exists experience_memories_user_created_idx
  on public.experience_memories (user_id, created_at desc);

alter table public.experience_memories enable row level security;

create policy experience_memories_owner_select on public.experience_memories
  for select using (auth.uid() = user_id);
create policy experience_memories_owner_insert on public.experience_memories
  for insert with check (auth.uid() = user_id);
create policy experience_memories_owner_update on public.experience_memories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger experience_memories_set_updated_at
  before update on public.experience_memories
  for each row execute function public.tg_set_updated_at();
