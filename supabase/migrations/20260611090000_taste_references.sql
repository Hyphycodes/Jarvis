-- Taste reference canon — the anchor points every judgment compares against.
-- YES references are the bar ("the Costera of X"); NO references are the
-- auto-reject energy ("giving Tao"). The negative space is the gold: a profile
-- that only knows yeses can only approve. lane NULL = cross-domain axis.

create table if not exists public.taste_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  lane text,
  kind text not null check (kind in ('yes', 'no')),
  note text,
  source text not null default 'manual'
    check (source in ('seed', 'experience', 'voice', 'manual')),
  strength numeric not null default 0.7,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists taste_references_user_name_kind
  on public.taste_references (user_id, lower(name), kind);
create index if not exists taste_references_user_lane
  on public.taste_references (user_id, lane);

alter table public.taste_references enable row level security;

drop policy if exists taste_references_owner_select on public.taste_references;
create policy taste_references_owner_select on public.taste_references
  for select using (auth.uid() = user_id);

drop policy if exists taste_references_owner_insert on public.taste_references;
create policy taste_references_owner_insert on public.taste_references
  for insert with check (auth.uid() = user_id);

drop policy if exists taste_references_owner_update on public.taste_references;
create policy taste_references_owner_update on public.taste_references
  for update using (auth.uid() = user_id);

drop policy if exists taste_references_owner_delete on public.taste_references;
create policy taste_references_owner_delete on public.taste_references
  for delete using (auth.uid() = user_id);

drop trigger if exists taste_references_set_updated_at on public.taste_references;
create trigger taste_references_set_updated_at
  before update on public.taste_references
  for each row execute function public.tg_set_updated_at();

-- New pipeline rejection reason: hard veto at pre-score for candidates that
-- match a dealbreaker or NO reference (negative filters enforced at source).
alter table public.radar_pipeline_rejections
  drop constraint if exists radar_pipeline_rejections_reason_check;
alter table public.radar_pipeline_rejections
  add constraint radar_pipeline_rejections_reason_check check (reason in (
    'light_enrich_fail','pre_score_low','deep_enrich_fail','council_floor',
    'devil_advocate_kill','plan_fail','plan_generic','comparative_cut','editor_cut',
    'negative_filter_veto'));
