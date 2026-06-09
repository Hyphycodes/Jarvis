-- Idempotent repair for the Radar warehouse / Private-Layer migrations
-- (20260608120000 / 223000 / 231000 / 233000). Those files used bare
-- `create policy` / `create trigger`, so re-running them after a partial apply
-- threw "policy ... already exists" and stopped — leaving production drifted
-- (observed: moves_items was missing its owner_select policy).
--
-- This migration re-asserts RLS + the owner policies + the updated_at trigger
-- for all four tables with drop-if-exists/create, so it is safe to run any
-- number of times. It does NOT drop tables, delete rows, or loosen security —
-- every policy keeps the same `auth.uid() = user_id` owner check. Columns,
-- indexes, and check constraints already use IF NOT EXISTS in their own
-- migrations and are confirmed present, so they are not repeated here.

-- ── user_operating_preferences ───────────────────────────────────────────────
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

-- ── culture_items ────────────────────────────────────────────────────────────
alter table public.culture_items enable row level security;
drop policy if exists culture_items_owner_select on public.culture_items;
create policy culture_items_owner_select on public.culture_items
  for select using (auth.uid() = user_id);
drop policy if exists culture_items_owner_insert on public.culture_items;
create policy culture_items_owner_insert on public.culture_items
  for insert with check (auth.uid() = user_id);
drop policy if exists culture_items_owner_update on public.culture_items;
create policy culture_items_owner_update on public.culture_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists culture_items_set_updated_at on public.culture_items;
create trigger culture_items_set_updated_at
  before update on public.culture_items
  for each row execute function public.tg_set_updated_at();

-- ── places_items ─────────────────────────────────────────────────────────────
alter table public.places_items enable row level security;
drop policy if exists places_items_owner_select on public.places_items;
create policy places_items_owner_select on public.places_items
  for select using (auth.uid() = user_id);
drop policy if exists places_items_owner_insert on public.places_items;
create policy places_items_owner_insert on public.places_items
  for insert with check (auth.uid() = user_id);
drop policy if exists places_items_owner_update on public.places_items;
create policy places_items_owner_update on public.places_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists places_items_set_updated_at on public.places_items;
create trigger places_items_set_updated_at
  before update on public.places_items
  for each row execute function public.tg_set_updated_at();

-- ── moves_items (this is the table that was missing owner_select) ─────────────
alter table public.moves_items enable row level security;
drop policy if exists moves_items_owner_select on public.moves_items;
create policy moves_items_owner_select on public.moves_items
  for select using (auth.uid() = user_id);
drop policy if exists moves_items_owner_insert on public.moves_items;
create policy moves_items_owner_insert on public.moves_items
  for insert with check (auth.uid() = user_id);
drop policy if exists moves_items_owner_update on public.moves_items;
create policy moves_items_owner_update on public.moves_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop trigger if exists moves_items_set_updated_at on public.moves_items;
create trigger moves_items_set_updated_at
  before update on public.moves_items
  for each row execute function public.tg_set_updated_at();
