-- ─── CÁLCULOS DE ATUALIZAÇÃO DE DÉBITO ───────────────────
-- Persiste cada cálculo feito na calculadora. Serve pra:
--  1) Histórico geral (últimos cálculos, ver de novo)
--  2) Vincular a um processo (aba Financeiro do processo)
-- Idempotente: pode rodar várias vezes sem efeito colateral.

create table if not exists public.calculos_atualizacao (
  id                 uuid primary key default gen_random_uuid(),
  processo_id        uuid references public.processos(id) on delete set null,
  titulo             text,
  -- Entradas (memória do que foi calculado)
  parcelas           jsonb not null default '[]'::jsonb,   -- [{valor, data_venc}]
  data_final         date not null,
  indice             text not null,                        -- 'ipca'|'igpm'|'inpc'|'selic'|'tr'|'ipcae'|'manual'|'nenhum'
  indice_manual_pct  numeric(10,4),                        -- só se indice='manual'
  juros_pct_am       numeric(10,4) default 1,              -- % ao mês
  juros_tipo         text default 'simples' check (juros_tipo in ('simples','composto')),
  multa_pct          numeric(10,4) default 0,
  honorarios_pct     numeric(10,4) default 0,
  -- Resultado (memoria do calculo)
  resultado          jsonb,                                -- {valorCorrigido, juros, multa, honor, total, taxaCorrecao, meses, serieItens}
  observacoes        text,
  criado_em          timestamptz default now(),
  criado_por_id      uuid references public.usuarios(id)
);
create index if not exists idx_calc_processo on public.calculos_atualizacao (processo_id);
create index if not exists idx_calc_criado   on public.calculos_atualizacao (criado_em desc);

alter table public.calculos_atualizacao enable row level security;
drop policy if exists "calc_atualizacao_full" on public.calculos_atualizacao;
create policy "calc_atualizacao_full" on public.calculos_atualizacao
  for all using (true) with check (true);
