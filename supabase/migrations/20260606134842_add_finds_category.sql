-- Add 'finds' as a valid category in surfaced_items.
-- Finds = things to buy/source/upgrade/replace (not outings).
-- Kept out of RADAR_CATEGORIES (the 6 discovery cats) to avoid Record<RadarCategory>
-- blast radius; handled as a separate Radar filter with its own detail page.

alter table public.surfaced_items
  drop constraint if exists surfaced_items_category_enum;

alter table public.surfaced_items
  add constraint surfaced_items_category_enum check (
    category is null or category = any(array[
      'moves', 'events', 'culture', 'dining', 'places', 'style', 'finds'
    ])
  );
