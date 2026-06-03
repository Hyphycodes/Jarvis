-- Sprint 12.5: Foundation Sprint mode for aggressive bounded Library buildout

alter table public.radar_autopilot_settings
  add column if not exists foundation_sprint_enabled boolean not null default false,
  add column if not exists foundation_sprint_started_at timestamptz,
  add column if not exists foundation_sprint_completed_at timestamptz,
  add column if not exists foundation_sprint_targets jsonb not null default '{}'::jsonb,
  add column if not exists foundation_sprint_reason text,
  add column if not exists foundation_sprint_mission_cursor integer not null default 0;

alter table public.radar_autopilot_runs
  drop constraint if exists radar_autopilot_runs_mode_check;
alter table public.radar_autopilot_runs
  add constraint radar_autopilot_runs_mode_check check (
    mode in ('scheduled','bootstrap','owner_requested','manual_force','foundation_sprint')
  );

alter table public.radar_autopilot_runs
  drop constraint if exists radar_autopilot_runs_status_check;
alter table public.radar_autopilot_runs
  add constraint radar_autopilot_runs_status_check check (
    status in ('queued','running','succeeded','partial_success','failed','paused','cancelled','blocked')
  );
