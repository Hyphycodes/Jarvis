-- Phase 6: Occasion type tagging on surfaced_items and current_events

alter table surfaced_items add column if not exists occasion_type text;
alter table current_events add column if not exists occasion_type text;

create index if not exists surfaced_items_occasion_type_idx
  on surfaced_items (user_id, occasion_type, updated_at);
