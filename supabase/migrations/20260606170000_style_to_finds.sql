-- Radar refactor: Style is no longer a visible Radar filter — it becomes one of
-- several internal "source brains" feeding Finds. Migrate existing Radar items
-- that were categorized as 'style' or 'product' into the Finds surface, without
-- losing any data or saved/passed history.
--
-- Notes:
-- - We keep 'style' in the surfaced_items_category_enum CHECK constraint (added
--   in 20260606134842_add_finds_category.sql). The internal Style brain may
--   still tag things 'style'; only the VISIBLE filter row changes (UI-only).
-- - The /find/[id] detail page reads payload.finds (a ProductDossier). For
--   migrated rows that never went through the Product Researcher we backfill a
--   minimal dossier so the page renders in a "needs_enrichment" state; the Finds
--   research job can later enrich them.

-- 1) Re-home style/product Radar items into Finds (status/payload/history kept).
update public.surfaced_items
set
  category = 'finds',
  type     = 'finds',
  updated_at = now()
where category in ('style', 'product');

-- 2) Backfill a minimal payload.finds for migrated rows that lack one, so the
--    Finds detail page + card have a dossier to render. Marked needs_enrichment.
update public.surfaced_items
set payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
  'source', coalesce(payload->>'source', 'style'),
  'source_brain', 'style',
  'finds', jsonb_build_object(
    'mission_title', coalesce(title, 'Find'),
    'why_surfaced', coalesce(description, ''),
    'source_brain', 'style',
    'subcategory', null,
    'best_pick', null,
    'alternatives', '{}'::jsonb,
    'avoid', '[]'::jsonb,
    'buy_if', null,
    'skip_if', null,
    'verdict_strength', coalesce(score, 0),
    'confidence', 0,
    'research_state', 'needs_enrichment'
  )
)
where category = 'finds'
  and (payload is null or payload->'finds' is null);
