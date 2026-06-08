-- Stage 5 (deep enrich) writes Google Places geo onto the dining sub-library row
-- so it flows forward (category_best.enrichment_data → radar_library → the
-- surfaced_items mirror, which renders the map + directions). Per
-- radar-curation-engine.md stage 5.
alter table public.dining_restaurants add column if not exists address text;
alter table public.dining_restaurants add column if not exists lat double precision;
alter table public.dining_restaurants add column if not exists lng double precision;

alter table public.dining_bars add column if not exists address text;
alter table public.dining_bars add column if not exists lat double precision;
alter table public.dining_bars add column if not exists lng double precision;

alter table public.dining_cafes add column if not exists address text;
alter table public.dining_cafes add column if not exists lat double precision;
alter table public.dining_cafes add column if not exists lng double precision;
