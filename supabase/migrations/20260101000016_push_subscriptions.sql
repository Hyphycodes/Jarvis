-- =====================================================================
-- Web Push subscriptions
-- =====================================================================
-- One row per (user, browser endpoint). Used by the ambient push layer
-- (Evening Active Mode) to reach the founder when the day winds down.
-- =====================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.tg_set_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "owner only" on public.push_subscriptions;
create policy "owner only" on public.push_subscriptions
  for all using (auth.uid() = user_id);
