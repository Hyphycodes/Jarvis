-- Add shape to plans
alter table public.plans
  add column if not exists shape text not null default 'experience'
  constraint plans_shape_check check (
    shape in ('experience', 'occasion', 'acquisition', 'touchpoint')
  );

-- Add is_sequential flag (controls whether The Move section renders)
alter table public.plans
  add column if not exists is_sequential boolean not null default false;

-- Wardrobe items table
create table if not exists public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  photo_url text not null,
  category text not null
    constraint wardrobe_items_category_check check (
      category in ('tops', 'bottoms', 'shoes', 'outerwear', 'accessories', 'headwear')
    ),
  color text,
  secondary_color text,
  formality text
    constraint wardrobe_items_formality_check check (
      formality in ('casual', 'smart-casual', 'business', 'formal')
    ),
  season text[],
  activity_tags text[],
  brand text,
  description text,
  condition text not null default 'good'
    constraint wardrobe_items_condition_check check (
      condition in ('great', 'good', 'worn', 'retired')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wardrobe_items_user_idx
  on public.wardrobe_items (user_id, category, created_at desc);

alter table public.wardrobe_items enable row level security;

drop policy if exists "owner access wardrobe" on public.wardrobe_items;
create policy "owner access wardrobe"
  on public.wardrobe_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists wardrobe_items_set_updated_at on public.wardrobe_items;
create trigger wardrobe_items_set_updated_at
  before update on public.wardrobe_items
  for each row execute function public.tg_set_updated_at();
