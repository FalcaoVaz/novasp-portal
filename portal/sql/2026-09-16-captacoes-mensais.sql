-- ═══════════════════════════════════════════════════════════════
-- Captação mensal por corretor (pedido do Anderson, 16/09/2026).
-- Testado no SANDBOX antes de ir pra produção.
--
-- Diferenças vs. rascunho original (ajustadas pro schema/arquitetura reais):
--   • RLS = padrão do portal ("acesso_autenticado"): libera authenticated e
--     o "quem pode enviar" é gated na UI (podeAcessarVendas). O portal NÃO
--     usa RLS por papel: usuarios não tem coluna `papel` e auth.uid() do
--     GoTrue não casa com usuarios.id (0 matches) — a policy por auth.uid()
--     bloquearia todo mundo.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create table if not exists vendas_captacoes_mensais (
  id             uuid primary key default gen_random_uuid(),
  corretor_id    uuid not null references vendas_corretores(id) on delete cascade,
  corretor_nome  text not null,           -- trilha do nome usado no casamento (auditoria)
  equipe         text not null,
  mes_referencia date not null,           -- sempre dia 1 do mês (ex.: 2026-09-01)
  quantidade     int  not null check (quantidade >= 0),
  enviado_por    uuid references usuarios(id),
  enviado_em     timestamptz not null default now(),
  unique (corretor_id, mes_referencia)    -- reenviar o mês substitui, não duplica
);
create index if not exists idx_captacoes_mes on vendas_captacoes_mensais (mes_referencia);

alter table vendas_captacoes_mensais enable row level security;
drop policy if exists acesso_autenticado on vendas_captacoes_mensais;
create policy acesso_autenticado on vendas_captacoes_mensais
  for all to authenticated using (true) with check (true);

select 'ok — vendas_captacoes_mensais criada' as status;
