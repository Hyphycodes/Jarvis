-- Carry the specialist council's output (verdict, concerns, devil's-advocate notes,
-- authenticity read) on the sub-library row so it flows forward to category_best.
-- Per radar-curation-engine.md stage 6.
alter table public.dining_restaurants add column if not exists council jsonb;
alter table public.dining_bars        add column if not exists council jsonb;
alter table public.dining_cafes       add column if not exists council jsonb;
