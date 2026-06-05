-- =====================================================================
-- Jarvis · universal index + lifecycle
-- Migration 0003: extend surfaced_items into the Universal Index for
-- every item Jarvis can surface. Pure ALTERs, no new tables.
-- =====================================================================

-- ---------------------------------------------------------------------
-- surfaced_items: normalized item shape.
-- ---------------------------------------------------------------------
alter table public.surfaced_items
  add column if not exists type            text,
  add column if not exists category        text,
  add column if not exists title           text,
  add column if not exists subtitle        text,
  add column if not exists description     text,
  add column if not exists location_name   text,
  add column if not exists address         text,
  add column if not exists lat             double precision,
  add column if not exists lng             double precision,
  add column if not exists starts_at       timestamptz,
  add column if not exists ends_at         timestamptz,
  add column if not exists expires_at      timestamptz,
  add column if not exists url             text,
  add column if not exists image_url       text,
  add column if not exists source_id       text,
  add column if not exists reasons         text[] not null default '{}',
  add column if not exists tags            text[] not null default '{}';

-- Default new rows to the start of the lifecycle.
alter table public.surfaced_items
  alter column status set default 'discovered';

-- Migrate any pre-existing 'active' rows (only legacy default) to 'discovered'
-- so the new check constraint can be enforced cleanly.
update public.surfaced_items set status = 'discovered' where status = 'active';

alter table public.surfaced_items
  drop constraint if exists surfaced_items_status_check;
alter table public.surfaced_items
  add constraint surfaced_items_status_check check (
    status in (
      'discovered',
      'shown',
      'opened',
      'saved',
      'passed',
      'planned',
      'completed',
      'expired',
      'archived'
    )
  );

create index if not exists surfaced_items_user_status_idx
  on public.surfaced_items (user_id, status, updated_at desc);
create index if not exists surfaced_items_user_type_idx
  on public.surfaced_items (user_id, type);
create index if not exists surfaced_items_tags_idx
  on public.surfaced_items using gin (tags);
create index if not exists surfaced_items_expires_at_idx
  on public.surfaced_items (expires_at)
  where expires_at is not null;

-- ---------------------------------------------------------------------
-- behavior_signals: add (user_id, signal_type, created_at desc) for
-- recent-activity reads. The (user_id, signal_type) index from 0002
-- doesn't help time-ordered queries.
-- ---------------------------------------------------------------------
create index if not exists behavior_signals_user_type_created_idx
  on public.behavior_signals (user_id, signal_type, created_at desc);

-- ---------------------------------------------------------------------
-- memory_update_proposals: allow 'archived' decisions in addition to
-- accept/reject. Archived proposals stop resurfacing but keep their
-- evidence trail.
-- ---------------------------------------------------------------------
alter table public.memory_update_proposals
  drop constraint if exists memory_update_proposals_status_check;
alter table public.memory_update_proposals
  add constraint memory_update_proposals_status_check check (
    status in ('pending', 'accepted', 'rejected', 'archived')
  );
