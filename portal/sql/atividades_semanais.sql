-- ─── ATIVIDADES SEMANAIS ─────────────────────────────────
-- Cada liderado tem uma LISTA de atividades que faz toda semana.
-- A lista em si é cadastrada uma vez (por usuario_id).
-- O CHECK é por semana — usa coluna semana_iso (YYYY-Www, ex: '2026-W26').

-- Lista mestra: atividades de cada usuário (não reseta)
create table if not exists public.atividades_semanais (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios(id) on delete cascade,
  descricao     text not null,
  ordem         int default 0,
  ativo         boolean default true,
  criado_em     timestamptz default now(),
  criado_por_id uuid references public.usuarios(id)
);
create index if not exists idx_atvsem_usuario on public.atividades_semanais (usuario_id);
create index if not exists idx_atvsem_ativo   on public.atividades_semanais (ativo) where ativo = true;

-- Checks por semana (1 linha por atividade × semana)
create table if not exists public.atividades_semanais_check (
  id            uuid primary key default gen_random_uuid(),
  atividade_id  uuid not null references public.atividades_semanais(id) on delete cascade,
  usuario_id    uuid not null references public.usuarios(id) on delete cascade,
  semana_iso    text not null,           -- 'YYYY-Www' p.ex. '2026-W26'
  feito         boolean default true,
  feito_em      timestamptz default now(),
  observacao    text,
  unique (atividade_id, semana_iso)
);
create index if not exists idx_atvsem_chk_usu  on public.atividades_semanais_check (usuario_id);
create index if not exists idx_atvsem_chk_sem  on public.atividades_semanais_check (semana_iso);

alter table public.atividades_semanais       enable row level security;
alter table public.atividades_semanais_check enable row level security;
drop policy if exists "atvsem_full_anon" on public.atividades_semanais;
drop policy if exists "atvsemchk_full_anon" on public.atividades_semanais_check;
create policy "atvsem_full_anon"    on public.atividades_semanais       for all using (true) with check (true);
create policy "atvsemchk_full_anon" on public.atividades_semanais_check for all using (true) with check (true);
