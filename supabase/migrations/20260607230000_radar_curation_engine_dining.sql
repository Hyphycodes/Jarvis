-- Radar Curation Engine — dining-first schema (per ~/Downloads/radar-curation-engine.md).
-- Built ALONGSIDE the existing surfaced_items pipeline; render mirrors radar_bench →
-- surfaced_items during cutover. Engine writes via the service client (bypasses RLS);
-- owner-only SELECT policies let the render read radar_bench under the user session.

-- ── Sub-library spine + dining domain columns ────────────────────────────────
-- Three dining sub-libraries: same structure, different sources / specialist brain
-- / sub_type. Permanent record of everything ever seen; external_id is the dedup key.

create table if not exists public.dining_restaurants (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  external_id      text        not null,
  name             text        not null,
  lane             text        not null default 'dining',
  sub_type         text,
  neighborhood     text,
  taste_vector     jsonb       not null default '{}',  -- {craft,fit,timing,novelty,relational}
  pre_score        numeric,
  final_score      numeric,
  plan_id          uuid,
  status           text        not null default 'discovered'
                     check (status in ('discovered','scored','finalist','enriched','judged','promoted','rejected')),
  rejection_stage  text,
  rejection_reason text,
  -- dining domain
  google_place_id  text,
  cuisine          text,
  price_level      text,
  hours            text,
  reservation_required boolean,
  photo_urls       jsonb,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, external_id)
);

create table if not exists public.dining_bars (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  external_id      text        not null,
  name             text        not null,
  lane             text        not null default 'dining',
  sub_type         text,
  neighborhood     text,
  taste_vector     jsonb       not null default '{}',
  pre_score        numeric,
  final_score      numeric,
  plan_id          uuid,
  status           text        not null default 'discovered'
                     check (status in ('discovered','scored','finalist','enriched','judged','promoted','rejected')),
  rejection_stage  text,
  rejection_reason text,
  google_place_id  text,
  cuisine          text,
  price_level      text,
  hours            text,
  reservation_required boolean,
  photo_urls       jsonb,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, external_id)
);

create table if not exists public.dining_cafes (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  external_id      text        not null,
  name             text        not null,
  lane             text        not null default 'dining',
  sub_type         text,
  neighborhood     text,
  taste_vector     jsonb       not null default '{}',
  pre_score        numeric,
  final_score      numeric,
  plan_id          uuid,
  status           text        not null default 'discovered'
                     check (status in ('discovered','scored','finalist','enriched','judged','promoted','rejected')),
  rejection_stage  text,
  rejection_reason text,
  google_place_id  text,
  cuisine          text,
  price_level      text,
  hours            text,
  reservation_required boolean,
  photo_urls       jsonb,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, external_id)
);

create index if not exists dining_restaurants_user_status_idx on public.dining_restaurants (user_id, status, pre_score desc);
create index if not exists dining_bars_user_status_idx on public.dining_bars (user_id, status, pre_score desc);
create index if not exists dining_cafes_user_status_idx on public.dining_cafes (user_id, status, pre_score desc);

-- ── category_best — each lane's curated shelf (category editor output) ────────
create table if not exists public.category_best (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references public.profiles(id) on delete cascade,
  lane                text        not null,
  source_sub_library  text        not null,
  external_id         text        not null,
  name                text        not null,
  sub_type            text,
  neighborhood        text,
  final_score         numeric,
  comparative_rank    integer,
  plan_id             uuid,
  enrichment_data     jsonb       not null default '{}',
  editor_notes        text,
  promoted_at         timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, lane, external_id)
);
create index if not exists category_best_user_lane_idx on public.category_best (user_id, lane, final_score desc);

-- ── radar_library — unified winners gathered from every lane's category_best ──
create table if not exists public.radar_library (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references public.profiles(id) on delete cascade,
  lane                    text        not null,
  source_category_best_id uuid        references public.category_best(id) on delete set null,
  external_id             text        not null,
  name                    text        not null,
  sub_type                text,
  neighborhood            text,
  final_score             numeric,
  plan_id                 uuid,
  enrichment_data         jsonb       not null default '{}',
  graduated_at            timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, lane, external_id)
);
create index if not exists radar_library_user_lane_idx on public.radar_library (user_id, lane, final_score desc);

-- ── radar_bench — ready-to-show inventory with decay + diversity metadata ─────
create table if not exists public.radar_bench (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  radar_library_id uuid        references public.radar_library(id) on delete cascade,
  lane             text        not null,
  sub_type         text,
  external_id      text        not null,
  name             text        not null,
  neighborhood     text,
  plan_id          uuid,
  score            numeric,
  decayed_score    numeric,
  status           text        not null default 'ready'
                     check (status in ('ready','shown','passed','expired')),
  benched_at       timestamptz not null default now(),
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, lane, external_id)
);
create index if not exists radar_bench_user_lane_status_idx on public.radar_bench (user_id, lane, status, decayed_score desc);

-- ── radar_pipeline_rejections — queryable per-stage death log ─────────────────
create table if not exists public.radar_pipeline_rejections (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  candidate_id  text,
  sub_library   text        not null,
  stage_died    text        not null,
  reason        text        not null check (reason in (
                  'light_enrich_fail','pre_score_low','deep_enrich_fail','council_floor',
                  'devil_advocate_kill','plan_fail','plan_generic','comparative_cut','editor_cut')),
  reason_detail text,
  created_at    timestamptz not null default now(),
  constraint radar_rej_devil_detail check (reason <> 'devil_advocate_kill' or reason_detail is not null)
);
create index if not exists radar_pipeline_rejections_idx
  on public.radar_pipeline_rejections (user_id, sub_library, reason, created_at desc);

-- ── Source registry signal columns (extend intelligence_sources, don't replace) ─
alter table public.intelligence_sources
  add column if not exists candidates_produced integer not null default 0,
  add column if not exists survivors_produced  integer not null default 0,
  add column if not exists signal_score        numeric,
  add column if not exists last_hit            timestamptz,
  add column if not exists sub_library         text;

-- ── updated_at triggers (shared helper) ──────────────────────────────────────
drop trigger if exists dining_restaurants_set_updated_at on public.dining_restaurants;
create trigger dining_restaurants_set_updated_at before update on public.dining_restaurants for each row execute function public.tg_set_updated_at();
drop trigger if exists dining_bars_set_updated_at on public.dining_bars;
create trigger dining_bars_set_updated_at before update on public.dining_bars for each row execute function public.tg_set_updated_at();
drop trigger if exists dining_cafes_set_updated_at on public.dining_cafes;
create trigger dining_cafes_set_updated_at before update on public.dining_cafes for each row execute function public.tg_set_updated_at();
drop trigger if exists category_best_set_updated_at on public.category_best;
create trigger category_best_set_updated_at before update on public.category_best for each row execute function public.tg_set_updated_at();
drop trigger if exists radar_library_set_updated_at on public.radar_library;
create trigger radar_library_set_updated_at before update on public.radar_library for each row execute function public.tg_set_updated_at();
drop trigger if exists radar_bench_set_updated_at on public.radar_bench;
create trigger radar_bench_set_updated_at before update on public.radar_bench for each row execute function public.tg_set_updated_at();

-- ── RLS: owner-only SELECT (engine writes via service client, bypassing RLS) ──
alter table public.dining_restaurants        enable row level security;
alter table public.dining_bars               enable row level security;
alter table public.dining_cafes              enable row level security;
alter table public.category_best             enable row level security;
alter table public.radar_library             enable row level security;
alter table public.radar_bench               enable row level security;
alter table public.radar_pipeline_rejections enable row level security;

drop policy if exists dining_restaurants_owner on public.dining_restaurants;
create policy dining_restaurants_owner on public.dining_restaurants for select using ((select auth.uid()) = user_id);
drop policy if exists dining_bars_owner on public.dining_bars;
create policy dining_bars_owner on public.dining_bars for select using ((select auth.uid()) = user_id);
drop policy if exists dining_cafes_owner on public.dining_cafes;
create policy dining_cafes_owner on public.dining_cafes for select using ((select auth.uid()) = user_id);
drop policy if exists category_best_owner on public.category_best;
create policy category_best_owner on public.category_best for select using ((select auth.uid()) = user_id);
drop policy if exists radar_library_owner on public.radar_library;
create policy radar_library_owner on public.radar_library for select using ((select auth.uid()) = user_id);
drop policy if exists radar_bench_owner on public.radar_bench;
create policy radar_bench_owner on public.radar_bench for select using ((select auth.uid()) = user_id);
drop policy if exists radar_pipeline_rejections_owner on public.radar_pipeline_rejections;
create policy radar_pipeline_rejections_owner on public.radar_pipeline_rejections for select using ((select auth.uid()) = user_id);
