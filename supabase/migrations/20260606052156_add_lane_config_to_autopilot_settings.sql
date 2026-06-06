-- Add lane_config to radar_autopilot_settings.
-- Stores per-category overrides (floor, ceiling, disabled) as a JSON object
-- keyed by RadarCategory. Null means all defaults apply.

alter table public.radar_autopilot_settings
  add column if not exists lane_config jsonb;
