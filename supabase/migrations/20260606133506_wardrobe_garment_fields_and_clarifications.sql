-- Wardrobe subsystem expansion: per-garment detail fields + dedup + clarifications.
--
-- wardrobe_items gains:
--   pattern, material, fit_silhouette, style_notes, source — richer garment metadata
--   confidence — extraction confidence (0-1)
--   times_seen / last_seen — dedup signals (same hoodie worn 5x = 1 item, times_seen=5)
--   dedup_key — composite fingerprint (category|garmentKind|color|pattern|brand)
--   needs_clarification — flag set when intake raises open questions
--   photos — jsonb array of source photo URLs
--
-- wardrobe_clarifications — separate table for open questions Jarvis needs answered
-- (brand, material, season use, etc.), linked back to a wardrobe_items row.

-- ── wardrobe_items new columns ──────────────────────────────────────────────

alter table public.wardrobe_items
  add column if not exists pattern          text,
  add column if not exists material         text,
  add column if not exists fit_silhouette   text,
  add column if not exists style_notes      text,
  add column if not exists source           text,
  add column if not exists confidence       numeric,
  add column if not exists times_seen       integer     not null default 1,
  add column if not exists last_seen        timestamptz not null default now(),
  add column if not exists dedup_key        text,
  add column if not exists needs_clarification boolean not null default false,
  add column if not exists photos           jsonb       not null default '[]';

-- Index for fast dedup lookups during intake
create index if not exists wardrobe_items_user_dedup_idx
  on public.wardrobe_items (user_id, dedup_key);

-- ── wardrobe_clarifications ─────────────────────────────────────────────────

create table if not exists public.wardrobe_clarifications (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  wardrobe_item_id uuid        references public.wardrobe_items(id) on delete cascade,
  related_item_id  uuid        references public.wardrobe_items(id) on delete set null,
  question         text        not null,
  kind             text        not null default 'detail',
  options          text[]      not null default '{}',
  status           text        not null default 'open',
  answer           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists wardrobe_clarifications_user_status_idx
  on public.wardrobe_clarifications (user_id, status);

alter table public.wardrobe_clarifications enable row level security;

drop policy if exists "owner access wardrobe clarifications" on public.wardrobe_clarifications;
create policy "owner access wardrobe clarifications"
  on public.wardrobe_clarifications
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists wardrobe_clarifications_set_updated_at on public.wardrobe_clarifications;
create trigger wardrobe_clarifications_set_updated_at
  before update on public.wardrobe_clarifications
  for each row execute function public.tg_set_updated_at();
