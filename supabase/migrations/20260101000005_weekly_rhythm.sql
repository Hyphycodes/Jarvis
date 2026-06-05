alter table public.founder_profile
add column if not exists weekly_rhythm jsonb not null default '{
  "enabled": true,
  "workdays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
  "leave_home": "06:20",
  "leave_home_time": "06:20",
  "work_start": "07:00",
  "work_start_time": "07:00",
  "leave_work": "15:30",
  "leave_work_time": "15:30",
  "arrive_home": "16:30",
  "home_arrival_time": "16:30",
  "work_location": "Schaumburg",
  "timezone": "America/Chicago"
}'::jsonb;
