create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  diet_type text not null check (diet_type in ('omnivore','vegetarian','vegan','keto','paleo','pescatarian')),
  allergens text[] not null default '{}',
  max_cook_minutes int not null check (max_cook_minutes between 5 and 180),
  disliked_ingredients text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_catalog (
  id bigint primary key,
  title text not null,
  image_url text,
  cook_minutes int,
  calories int,
  source text not null default 'spoonacular',
  ingredients jsonb not null default '[]'::jsonb,
  diet_tags text[] not null default '{}',
  allergen_flags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_ingredients (
  id bigserial primary key,
  meal_id bigint not null references public.meal_catalog (id) on delete cascade,
  ingredient_name text not null,
  quantity numeric,
  unit text,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_tags (
  id bigserial primary key,
  meal_id bigint not null references public.meal_catalog (id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  unique (meal_id, tag)
);

create table if not exists public.daily_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_day date not null,
  meal_ids bigint[] not null,
  generated_with jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, session_day)
);

create table if not exists public.swipes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_id bigint not null references public.meal_catalog (id) on delete cascade,
  decision text not null check (decision in ('yes','no')),
  session_day date not null,
  created_at timestamptz not null default now(),
  unique (user_id, event_id)
);

create table if not exists public.daily_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_day date not null,
  top_meal_ids bigint[] not null,
  confidence_score numeric not null default 0,
  explanation text,
  created_at timestamptz not null default now(),
  unique (user_id, session_day)
);

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_day date not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, session_day)
);

create table if not exists public.reminder_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reminder_time text not null,
  timezone text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_generation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_day date not null,
  function_name text not null,
  prompt_digest text,
  model text,
  latency_ms int,
  status text not null,
  validation_errors jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.daily_decks enable row level security;
alter table public.swipes enable row level security;
alter table public.daily_results enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.ai_generation_logs enable row level security;

create policy "profiles_owner" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "decks_owner" on public.daily_decks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "swipes_owner" on public.swipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "results_owner" on public.daily_results
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "shopping_owner" on public.shopping_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "reminder_owner" on public.reminder_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "ai_logs_owner" on public.ai_generation_logs
  for select using (auth.uid() = user_id);

create index if not exists idx_swipes_user_day on public.swipes (user_id, session_day);
create index if not exists idx_decks_user_day on public.daily_decks (user_id, session_day);
create index if not exists idx_results_user_day on public.daily_results (user_id, session_day);
