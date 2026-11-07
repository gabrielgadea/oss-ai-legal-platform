-- Atlas Digital — mundo compartilhado (descobertas, lanternas, ecos, caravanas)
-- Incremental: aplicar após 001_atlas_digital.sql.
--
-- Vocabulário: "acender uma lanterna" = curtir; "ecoar" = compartilhar;
-- "caravana" = seguir. Contagens públicas só aparecem agregadas, com
-- k-anonimato (k >= 5) aplicado pela API. Rumores de caravana só expõem
-- descobertas de quem tornou o perfil público.

-- ---------------------------------------------------------------------------
-- Perfil de viajante (handle público opcional)
-- ---------------------------------------------------------------------------

create table if not exists public.atlas_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.atlas_profiles enable row level security;

drop policy if exists "Users manage their own atlas profile" on public.atlas_profiles;
create policy "Users manage their own atlas profile"
  on public.atlas_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Descobertas (territórios revelados)
-- ---------------------------------------------------------------------------

create table if not exists public.atlas_discoveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null check (place_id ~ '^[a-z0-9-]{1,40}$'),
  method text not null check (method in ('expedition','import','connector','manual')),
  verified boolean not null default false,
  discovered_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create index if not exists idx_atlas_discoveries_place
  on public.atlas_discoveries(place_id);

alter table public.atlas_discoveries enable row level security;

drop policy if exists "Users manage their own atlas discoveries" on public.atlas_discoveries;
create policy "Users manage their own atlas discoveries"
  on public.atlas_discoveries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Lanternas e ecos
-- ---------------------------------------------------------------------------

create table if not exists public.atlas_marks (
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null check (place_id ~ '^[a-z0-9-]{1,40}$'),
  lantern boolean not null default false,
  echoes integer not null default 0 check (echoes between 0 and 1000),
  updated_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create index if not exists idx_atlas_marks_place
  on public.atlas_marks(place_id);

alter table public.atlas_marks enable row level security;

drop policy if exists "Users manage their own atlas marks" on public.atlas_marks;
create policy "Users manage their own atlas marks"
  on public.atlas_marks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Caravanas (quem acompanha quem)
-- ---------------------------------------------------------------------------

create table if not exists public.atlas_caravans (
  follower_id uuid not null references auth.users(id) on delete cascade,
  leader_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, leader_id),
  check (follower_id <> leader_id)
);

alter table public.atlas_caravans enable row level security;

drop policy if exists "Users manage the caravans they joined" on public.atlas_caravans;
create policy "Users manage the caravans they joined"
  on public.atlas_caravans for all
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);
