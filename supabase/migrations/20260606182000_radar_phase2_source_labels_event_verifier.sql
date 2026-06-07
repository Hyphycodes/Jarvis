-- Radar Phase 2: persist category source labels and hold unverifiable events.

alter table public.surfaced_items
  add column if not exists source_label text;

create index if not exists surfaced_items_user_source_label_idx
  on public.surfaced_items (user_id, source_label)
  where source_label is not null;

alter table public.current_events
  drop constraint if exists current_events_status_check;

alter table public.current_events
  add constraint current_events_status_check check (
    status in ('pending','verified','surfaced','needs_enrichment','expired','rejected')
  );
