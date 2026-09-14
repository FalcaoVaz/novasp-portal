-- ─── ACORDOS EXTRAJUDICIAIS ──────────────────────────────
-- Controle dos acordos feitos com inquilinos para pagamento parcelado de
-- alugueis em aberto. Substitui a planilha "Acordos Extrajudicial.xlsx".

create table if not exists public.acordos_extrajudiciais (
  id              uuid primary key default gen_random_uuid(),
  proprietario    text not null,
  inquilino       text not null,
  contrato        text,                -- identificador interno do contrato (ex: "8185")
  dia_pagamento   int  check (dia_pagamento between 1 and 31),
  valor_parcela   numeric(12,2),
  parcelas_pagas  int default 0 check (parcelas_pagas >= 0),
  parcelas_total  int check (parcelas_total > 0),
  situacao        text,                -- descricao livre ("Acordo ref. alugueis de Nov, Dez, Jan...")
  status          text default 'ativo' check (status in ('ativo','concluido','rompido','renegociado')),
  processo_id     uuid references public.processos(id) on delete set null,
  responsavel_id  uuid references public.usuarios(id),
  observacoes     text,
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now()
);

create index if not exists idx_acordos_status     on public.acordos_extrajudiciais (status);
create index if not exists idx_acordos_processo   on public.acordos_extrajudiciais (processo_id);
create index if not exists idx_acordos_responsavel on public.acordos_extrajudiciais (responsavel_id);
create index if not exists idx_acordos_dia_pgto   on public.acordos_extrajudiciais (dia_pagamento);

-- Trigger pra atualizar `atualizado_em`
create or replace function public._touch_acordo_extrajudicial()
returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;

drop trigger if exists trg_acordo_extrajud_touch on public.acordos_extrajudiciais;
create trigger trg_acordo_extrajud_touch
  before update on public.acordos_extrajudiciais
  for each row execute function public._touch_acordo_extrajudicial();

-- Politicas RLS: ativar e permitir acesso autenticado (mesmo padrao das demais)
alter table public.acordos_extrajudiciais enable row level security;
drop policy if exists "acordos_full_anon" on public.acordos_extrajudiciais;
create policy "acordos_full_anon"
  on public.acordos_extrajudiciais
  for all
  using (true)
  with check (true);
