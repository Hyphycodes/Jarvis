-- The clean-data law, enforced in the DB: surfaced_items.category may only ever
-- be one of the six canonical Radar categories, or NULL. An invalid category
-- can never be written again. Mirrors lib/radar/category.ts RADAR_CATEGORIES.
ALTER TABLE public.surfaced_items
  ADD CONSTRAINT surfaced_items_category_enum
  CHECK (category IS NULL OR category IN ('moves','events','culture','dining','places','style'));
