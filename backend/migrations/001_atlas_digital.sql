-- Atlas Digital — mapa da atividade digital
-- Incremental: aplicar após 000_one_shot_schema.sql.
--
-- Privacidade:
--  * atlas_states guarda só agregados (minutos por lugar), nunca arquivos brutos.
--  * atlas_contributions é opt-in (consentimento, LGPD art. 7º, I), com valores
--    arredondados e sem lista de plataformas; exibida só agregada por UF com
--    k-anonimato (k >= 10) pela API.
--  * Todas as tabelas apagam em cascata com o usuário.
-- O backend usa a service role; as políticas RLS protegem acesso direto
-- pelo cliente Supabase.

-- ---------------------------------------------------------------------------
-- Estado pessoal
-- ---------------------------------------------------------------------------

create table if not exists public.atlas_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.atlas_states enable row level security;

drop policy if exists "Users manage their own atlas state" on public.atlas_states;
create policy "Users manage their own atlas state"
  on public.atlas_states for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Contribuições para o mapa do Brasil (opt-in)
-- ---------------------------------------------------------------------------

create table if not exists public.atlas_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  uf char(2) not null check (uf in (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
    'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  )),
  week text not null check (week ~ '^\d{4}-W\d{2}$'),
  diversity smallint not null check (diversity between 0 and 100),
  healthy_attention smallint not null check (healthy_attention between 0 and 100),
  open_share smallint not null check (open_share between 0 and 100),
  ad_share smallint not null check (ad_share between 0 and 100),
  weekly_hours smallint not null check (weekly_hours between 0 and 168),
  category_share jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, week)
);

create index if not exists idx_atlas_contributions_updated
  on public.atlas_contributions(updated_at);

alter table public.atlas_contributions enable row level security;

drop policy if exists "Users manage their own atlas contributions" on public.atlas_contributions;
create policy "Users manage their own atlas contributions"
  on public.atlas_contributions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Analytics de produto (lista fechada de eventos, sem conteúdo pessoal)
-- ---------------------------------------------------------------------------

create table if not exists public.atlas_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_atlas_events_occurred
  on public.atlas_events(occurred_at);
create index if not exists idx_atlas_events_name
  on public.atlas_events(name, occurred_at);

alter table public.atlas_events enable row level security;

drop policy if exists "Users read their own atlas events" on public.atlas_events;
create policy "Users read their own atlas events"
  on public.atlas_events for select
  using (auth.uid() = user_id);

-- Retenção sugerida (agendar via pg_cron, se disponível):
-- delete from public.atlas_events where occurred_at < now() - interval '180 days';
