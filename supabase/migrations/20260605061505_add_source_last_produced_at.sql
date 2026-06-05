alter table public.intelligence_sources
  add column if not exists last_produced_at timestamptz;

create index if not exists intelligence_sources_last_produced_at_idx
  on public.intelligence_sources (last_produced_at);
