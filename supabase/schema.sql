-- PrepSwipe Database Schema
-- Run this in the Supabase SQL Editor

-- ─── Profiles ────────────────────────────────────────────────────────────────

create table if not exists profiles (
  id uuid references auth.users primary key,
  name text,
  avatar_url text,
  dietary_goals text[] default '{}',
  cuisine_preferences text[] default '{}',
  skill_level text check (skill_level in ('beginner', 'home_cook', 'confident_chef')),
  cooking_frequency text check (cooking_frequency in ('few_times_week', 'most_days', 'just_starting')),
  weekly_budget text,
  meals_cooked_count integer default 0,
  recipes_submitted_count integer default 0,
  onboarding_complete boolean default false,
  created_at timestamp with time zone default now()
);

-- Auto-create profile on sign up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── Recipes ─────────────────────────────────────────────────────────────────

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cuisine text,
  source_type text check (source_type in ('curated', 'community', 'imported')),
  ingredients jsonb not null default '[]',
  steps jsonb not null default '[]',
  prep_time_mins integer,
  cook_time_mins integer,
  servings integer,
  cost_per_serving numeric(6,2),
  dietary_tags text[] default '{}',
  badge text check (badge in ('none', 'staff_pick', 'community_verified', 'community_favorite')) default 'none',
  submitted_by uuid references profiles(id),
  avg_rating numeric(3,2) default 0,
  rating_count integer default 0,
  save_count integer default 0,
  image_url text,
  created_at timestamp with time zone default now()
);

-- ─── Swipe Events ─────────────────────────────────────────────────────────────

create table if not exists swipe_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  recipe_id uuid references recipes(id) not null,
  direction text check (direction in ('right', 'left')) not null,
  mode text check (mode in ('meal_prep', 'spontaneous')) not null,
  swiped_at timestamp with time zone default now()
);

-- ─── Saved Recipes ────────────────────────────────────────────────────────────

create table if not exists saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  recipe_id uuid references recipes(id) not null,
  liked boolean default false,
  user_rating integer check (user_rating between 1 and 5),
  saved_at timestamp with time zone default now(),
  unique(user_id, recipe_id)
);

-- ─── Pantry ──────────────────────────────────────────────────────────────────

create table if not exists pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  ingredient_name text not null,
  quantity numeric,
  unit text,
  added_via text check (added_via in ('delivery', 'receipt', 'manual')),
  added_at timestamp with time zone default now(),
  expires_at timestamp with time zone
);

-- ─── Grocery Lists ────────────────────────────────────────────────────────────

create table if not exists grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  list_type text check (list_type in ('weekly', 'spontaneous')) not null,
  status text check (status in ('active', 'ordered', 'complete')) default 'active',
  items jsonb not null default '[]',
  estimated_total_cost numeric(8,2),
  delivery_partner text,
  created_at timestamp with time zone default now()
);

-- ─── Meal Plans ───────────────────────────────────────────────────────────────

create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  week_start_date date not null,
  is_public boolean default false,
  slots jsonb default '[]',
  created_at timestamp with time zone default now()
);

-- ─── Collections ─────────────────────────────────────────────────────────────

create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  name text not null,
  recipe_ids uuid[] default '{}',
  created_at timestamp with time zone default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table profiles enable row level security;
alter table recipes enable row level security;
alter table swipe_events enable row level security;
alter table saved_recipes enable row level security;
alter table pantry_items enable row level security;
alter table grocery_lists enable row level security;
alter table meal_plans enable row level security;
alter table collections enable row level security;

-- Profiles: users can only read/update their own
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- Recipes: anyone can read curated, users can manage their own
create policy "Anyone can view recipes" on recipes
  for select using (true);
create policy "Users can insert own recipes" on recipes
  for insert with check (auth.uid() = submitted_by);
create policy "Users can update own recipes" on recipes
  for update using (auth.uid() = submitted_by);

-- Swipe events: users manage their own
create policy "Users can insert own swipes" on swipe_events
  for insert with check (auth.uid() = user_id);
create policy "Users can view own swipes" on swipe_events
  for select using (auth.uid() = user_id);

-- Saved recipes: users manage their own
create policy "Users can manage own saved recipes" on saved_recipes
  for all using (auth.uid() = user_id);

-- Pantry: users manage their own
create policy "Users can manage own pantry" on pantry_items
  for all using (auth.uid() = user_id);

-- Grocery lists: users manage their own
create policy "Users can manage own grocery lists" on grocery_lists
  for all using (auth.uid() = user_id);

-- Meal plans: users manage their own, public plans are viewable by all
create policy "Users can manage own meal plans" on meal_plans
  for all using (auth.uid() = user_id);
create policy "Anyone can view public meal plans" on meal_plans
  for select using (is_public = true);

-- Collections: users manage their own
create policy "Users can manage own collections" on collections
  for all using (auth.uid() = user_id);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists idx_swipe_events_user_id on swipe_events(user_id);
create index if not exists idx_swipe_events_recipe_id on swipe_events(recipe_id);
create index if not exists idx_saved_recipes_user_id on saved_recipes(user_id);
create index if not exists idx_pantry_items_user_id on pantry_items(user_id);
create index if not exists idx_grocery_lists_user_id on grocery_lists(user_id);
create index if not exists idx_meal_plans_user_id on meal_plans(user_id);
create index if not exists idx_recipes_cuisine on recipes(cuisine);
create index if not exists idx_recipes_badge on recipes(badge);
