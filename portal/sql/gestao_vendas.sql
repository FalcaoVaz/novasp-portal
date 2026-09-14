-- ═══════════════════════════════════════════════════════════
-- GESTÃO DE VENDAS — Schema completo (5 tabelas)
-- ═══════════════════════════════════════════════════════════

-- ─── 1. SELEÇÃO DE IMÓVEIS ────────────────────────────────
-- Workflow:
-- 1) Assistente/corretor envia o imóvel (status=pendente)
-- 2) Gerente faz peneira → aprovado/reprovado
-- 3) Aprovado: ativo_ate = aprovado_em + 3 meses
-- 4) Job/Frontend: status=expirado quando ativo_ate < hoje

create table if not exists public.vendas_selecao_imoveis (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null,            -- código do imóvel no NIDO (BI..., MO..., JA...)
  endereco            text,
  metragem            numeric(8,2),
  tempo_venda         text,
  outras_opcoes       text,                     -- "outras opções no prédio (ref. e valor)"
  corretor            text,
  equipe              text,                     -- 'Aguia', 'Fenix', 'Moema', 'Jabaquara', etc.

  -- Mes de proposicao (YYYY-MM) - preenchido no upload em lote
  mes_referencia      text,

  enviado_por_id      uuid references public.usuarios(id),
  enviado_em          timestamptz default now(),

  status              text default 'pendente'
                       check (status in ('pendente','aprovado','reprovado','vendido','expirado','removido')),
  aprovado_em         timestamptz,
  aprovado_por_id     uuid references public.usuarios(id),
  motivo_reprovacao   text,

  -- vida útil de 3 meses após aprovação
  ativo_ate           date,

  observacoes         text,
  criado_em           timestamptz default now(),
  atualizado_em       timestamptz default now()
);
-- Idempotente: se a tabela ja existia sem mes_referencia, acrescenta agora
alter table public.vendas_selecao_imoveis add column if not exists mes_referencia text;
create index if not exists idx_sel_status     on public.vendas_selecao_imoveis (status);
create index if not exists idx_sel_equipe     on public.vendas_selecao_imoveis (equipe);
create index if not exists idx_sel_ativo_ate  on public.vendas_selecao_imoveis (ativo_ate);
create index if not exists idx_sel_codigo     on public.vendas_selecao_imoveis (codigo);


-- ─── 2. ATIVIDADES ─────────────────────────────────────────
create table if not exists public.vendas_atividades (
  id              uuid primary key default gen_random_uuid(),
  mes             text not null,                -- 'YYYY-MM'
  tipo            text,                         -- reuniao|treinamento|confraternizacao|selecao_imoveis|outro
  nome            text not null,                -- "Treinamento ITA", "Reunião Seleção Moema", etc
  data            date,
  hora            text,
  local           text,
  equipe          text,                         -- null = geral / todas as equipes
  observacoes     text,
  criado_em       timestamptz default now(),
  criado_por_id   uuid references public.usuarios(id)
);
create index if not exists idx_atv_mes    on public.vendas_atividades (mes);
create index if not exists idx_atv_tipo   on public.vendas_atividades (tipo);
create index if not exists idx_atv_equipe on public.vendas_atividades (equipe);


-- ─── 3. MARCAÇÕES DE PRESENÇA ──────────────────────────────
create table if not exists public.vendas_presencas (
  id              uuid primary key default gen_random_uuid(),
  atividade_id    uuid not null references public.vendas_atividades(id) on delete cascade,
  corretor_nome   text not null,
  equipe          text,
  presente        boolean default true,
  observacao      text,
  marcado_em      timestamptz default now(),
  marcado_por_id  uuid references public.usuarios(id),
  unique (atividade_id, corretor_nome)
);
create index if not exists idx_pres_atividade on public.vendas_presencas (atividade_id);
create index if not exists idx_pres_corretor  on public.vendas_presencas (corretor_nome);
create index if not exists idx_pres_equipe    on public.vendas_presencas (equipe);


-- ─── 4. COTAS DE ANÚNCIOS ──────────────────────────────────
create table if not exists public.vendas_cotas (
  id                uuid primary key default gen_random_uuid(),
  mes               text not null,              -- 'YYYY-MM'
  corretor_nome     text not null,
  equipe            text,
  super_destaque    int default 0,
  destaque_comum    int default 0,
  total_anuncios    int default 0,              -- soma manual ou calculada
  observacoes       text,
  criado_em         timestamptz default now(),
  atualizado_em     timestamptz default now(),
  unique (mes, corretor_nome)
);
create index if not exists idx_cota_mes      on public.vendas_cotas (mes);
create index if not exists idx_cota_equipe   on public.vendas_cotas (equipe);


-- ─── 4.5. VOTOS DA PENEIRA (5 votantes: 4 gerentes + Rodrigo) ──
-- Cada imóvel recebe até 5 votos; >= 3 aprovam (status=aprovado),
-- >= 3 reprovam (status=reprovado). A transição é feita pelo frontend.
create table if not exists public.vendas_selecao_votos (
  id              uuid primary key default gen_random_uuid(),
  imovel_id       uuid not null references public.vendas_selecao_imoveis(id) on delete cascade,
  votante_nome    text not null,                -- 'Renata','Felippe','Christiane','Emilia','Rodrigo'
  voto            text not null check (voto in ('aprovado','reprovado')),
  observacao      text,
  votado_em       timestamptz default now(),
  votado_por_id   uuid references public.usuarios(id),
  unique (imovel_id, votante_nome)
);
create index if not exists idx_voto_imovel on public.vendas_selecao_votos (imovel_id);


-- ─── 5. AGENDA DO FOTÓGRAFO ────────────────────────────────
create table if not exists public.vendas_agenda_fotografo (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  hora            text not null,                -- '09:00', '10:00', etc
  tipo            text default 'geral'
                   check (tipo in ('selecao','geral')),
  codigo_imovel   text,
  endereco        text,
  unidade         text,
  corretor        text,
  telefone        text,
  regiao          text,                         -- "Moema, Vila Olímpia...", "Jabaquara, Vila Guarani..."
  observacoes     text,
  status          text default 'agendado'
                   check (status in ('agendado','realizado','cancelado','livre')),
  criado_em       timestamptz default now(),
  criado_por_id   uuid references public.usuarios(id),
  unique (data, hora)
);
create index if not exists idx_foto_data on public.vendas_agenda_fotografo (data);
-- Idempotente: se a tabela ja existia sem `tipo`, adiciona agora
alter table public.vendas_agenda_fotografo add column if not exists tipo text default 'geral';
-- Backfill: agendamentos antigos viram 'selecao' se hora <= 11h, 'geral' caso contrario
update public.vendas_agenda_fotografo
   set tipo = case when hora <= '11:59' then 'selecao' else 'geral' end
 where tipo is null;

-- Flags de logistica do agendamento. Vago + chaves na portaria implica
-- que o fotografo pode entrar sem confirmar com ninguem (auto-livre).
alter table public.vendas_agenda_fotografo
  add column if not exists imovel_vago      boolean default false,
  add column if not exists chaves_portaria  boolean default false,
  add column if not exists confirmado       boolean default false,
  add column if not exists confirmado_em    timestamptz,
  add column if not exists confirmado_por_id uuid references public.usuarios(id);


-- ─── RLS ───────────────────────────────────────────────────
alter table public.vendas_selecao_imoveis  enable row level security;
alter table public.vendas_selecao_votos    enable row level security;
alter table public.vendas_atividades       enable row level security;
alter table public.vendas_presencas        enable row level security;
alter table public.vendas_cotas            enable row level security;
alter table public.vendas_agenda_fotografo enable row level security;

drop policy if exists "vendas_sel_full" on public.vendas_selecao_imoveis;
drop policy if exists "vendas_vot_full" on public.vendas_selecao_votos;
drop policy if exists "vendas_atv_full" on public.vendas_atividades;
drop policy if exists "vendas_pre_full" on public.vendas_presencas;
drop policy if exists "vendas_cot_full" on public.vendas_cotas;
drop policy if exists "vendas_fot_full" on public.vendas_agenda_fotografo;

create policy "vendas_sel_full" on public.vendas_selecao_imoveis  for all using (true) with check (true);
create policy "vendas_vot_full" on public.vendas_selecao_votos    for all using (true) with check (true);
create policy "vendas_atv_full" on public.vendas_atividades       for all using (true) with check (true);
create policy "vendas_pre_full" on public.vendas_presencas        for all using (true) with check (true);
create policy "vendas_cot_full" on public.vendas_cotas            for all using (true) with check (true);
create policy "vendas_fot_full" on public.vendas_agenda_fotografo for all using (true) with check (true);


-- ─── TRIGGERS DE updated_at ────────────────────────────────
create or replace function public._touch_vendas() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;

drop trigger if exists trg_touch_sel on public.vendas_selecao_imoveis;
create trigger trg_touch_sel before update on public.vendas_selecao_imoveis
  for each row execute function public._touch_vendas();

drop trigger if exists trg_touch_cot on public.vendas_cotas;
create trigger trg_touch_cot before update on public.vendas_cotas
  for each row execute function public._touch_vendas();
