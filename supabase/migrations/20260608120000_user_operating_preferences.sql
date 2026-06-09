-- Private Layer — declared OPERATING preferences (how Jarvis should move).
-- One row per user. Identity + durable taste stay in founder_profile; this is
-- the operating-controls layer (mode + spend + rhythm preferences). The
-- structured commute schedule stays in founder_profile.weekly_rhythm.
create table if not exists public.user_operating_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,

  -- Operating mode — how hard Jarvis should push.
  operating_mode text not null default 'balanced'
    check (operating_mode in ('balanced','building','saving','social','recovery','travel','deep_work')),

  -- Spend comfort (not a finance tracker — posture only).
  annual_income_range text,
  spend_mode text not null default 'balanced'
    check (spend_mode in ('saving','balanced','lifestyle','growth','invest')),
  savings_priority text check (savings_priority in ('low','medium','high')),
  fixed_expense_pressure text check (fixed_expense_pressure in ('low','medium','high')),
  dining_normal_min integer,
  dining_normal_max integer,
  dining_premium_min integer,
  dining_premium_max integer,
  finds_comfort text not null default 'premium_realistic'
    check (finds_comfort in ('attainable','premium_realistic','aspirational')),
  premium_threshold integer not null default 300,
  aspirational_frequency text not null default 'rare_unless_requested'
    check (aspirational_frequency in ('rare_unless_requested','occasional','open_when_requested')),

  -- Rhythm preferences (the structured commute schedule lives in
  -- founder_profile.weekly_rhythm; these are the operating toggles on top).
  preferred_plan_windows jsonb not null default '[]'::jsonb,
  sunday_reset boolean not null default true,
  low_friction_weeknights boolean not null default true,
  recovery_preference text,
  social_window text,
  deep_work_window text,
  rhythm_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_operating_preferences enable row level security;

drop policy if exists user_operating_preferences_owner_select on public.user_operating_preferences;
create policy user_operating_preferences_owner_select on public.user_operating_preferences
  for select using (auth.uid() = user_id);
drop policy if exists user_operating_preferences_owner_insert on public.user_operating_preferences;
create policy user_operating_preferences_owner_insert on public.user_operating_preferences
  for insert with check (auth.uid() = user_id);
drop policy if exists user_operating_preferences_owner_update on public.user_operating_preferences;
create policy user_operating_preferences_owner_update on public.user_operating_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists user_operating_preferences_set_updated_at on public.user_operating_preferences;
create trigger user_operating_preferences_set_updated_at
  before update on public.user_operating_preferences
  for each row execute function public.tg_set_updated_at();
