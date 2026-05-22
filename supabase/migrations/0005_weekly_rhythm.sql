alter table public.founder_profile
add column if not exists weekly_rhythm jsonb not null default '{
  "enabled": true,
  "workdays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "leave_home": "06:20",
  "work_start": "07:00",
  "leave_work": "15:30",
  "arrive_home": "16:30",
  "work_location": "Schaumburg",
  "timezone": "America/Chicago"
}'::jsonb;
