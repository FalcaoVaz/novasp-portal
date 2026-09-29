-- ═══════════════════════════════════════════════════════════════
-- Gestão de Vendas · Planilha Mensal por EQUIPE (pedido do Anderson, 29/09/2026)
-- 6 sub-módulos alimentados pelo Excel "MODELO - Preenchimento Mensal por EQUIPE - OFICIAL"
-- (1 aba → 1 sub-módulo). Cada upload vira uma importação; a mais recente do mês vale.
--
-- Ajustes vs. rascunho original (mesmos motivos do SQL de captações de 16/09):
--   • importado_por referencia usuarios(id) e é preenchido pela UI com CUR.id —
--     auth.uid() do GoTrue NÃO casa com usuarios.id, então "default auth.uid()"
--     e a policy "importado_por = auth.uid()" não funcionam neste portal.
--   • RLS no padrão do portal ("acesso_autenticado", for all): quem pode importar/
--     excluir é gated na UI (podeImportarPlanilhaVendas). Permite ao gestor excluir
--     uma importação errada pela tela (cascade apaga as linhas).
--   • Sem CHECK regex em referencia: referência fora do padrão vira AVISO na prévia,
--     não erro que derruba a gravação inteira.
-- Rodar PRIMEIRO no sandbox. Produção: só o Rodrigo.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- 1) Cada upload do Excel = 1 importação (histórico fica; a última do mês vale)
create table if not exists vendas_planilhas_importacoes (
  id                 uuid primary key default gen_random_uuid(),
  mes_ref            date        not null check (extract(day from mes_ref) = 1),  -- sempre dia 1
  arquivo_nome       text        not null,
  importado_em       timestamptz not null default now(),   -- "Planilha inserida no sistema em ..."
  importado_por      uuid        references usuarios(id),
  importado_por_nome text,
  limites            jsonb       not null default '{}'::jsonb,  -- limites lidos do próprio Excel
  contagem           jsonb       not null default '{}'::jsonb,  -- linhas por sub-módulo
  avisos             jsonb       not null default '[]'::jsonb
);
create index if not exists idx_vpi_mes on vendas_planilhas_importacoes (mes_ref, importado_em desc);

-- 2) Linhas de todas as abas, marcadas pelo sub-módulo de destino
create table if not exists vendas_planilhas_linhas (
  id             bigint generated always as identity primary key,
  importacao_id  uuid not null references vendas_planilhas_importacoes(id) on delete cascade,
  mes_ref        date not null,
  submodulo      text not null check (submodulo in (
                   'cota_anuncios_apto','cota_extra_apto',
                   'cota_anuncios_casas','cota_extra_casas',
                   'captacao_placas','vendidos_selecao')),
  linha_excel    int,
  referencia     text,
  corretor       text,
  equipe         text,
  tipo_anuncio   text check (tipo_anuncio is null or tipo_anuncio in ('SUPER DESTAQUE','DESTAQUE')),
  captacoes      int  check (captacoes is null or captacoes >= 0),
  placas         int  check (placas is null or placas >= 0)
);
create index if not exists idx_vpl_imp_sub on vendas_planilhas_linhas (importacao_id, submodulo);

-- 3) RLS no padrão do portal
alter table vendas_planilhas_importacoes enable row level security;
alter table vendas_planilhas_linhas      enable row level security;
drop policy if exists acesso_autenticado on vendas_planilhas_importacoes;
drop policy if exists acesso_autenticado on vendas_planilhas_linhas;
create policy acesso_autenticado on vendas_planilhas_importacoes
  for all to authenticated using (true) with check (true);
create policy acesso_autenticado on vendas_planilhas_linhas
  for all to authenticated using (true) with check (true);

select 'ok — vendas_planilhas_importacoes + vendas_planilhas_linhas criadas' as status;

-- Rollback (se precisar):
-- drop table if exists vendas_planilhas_linhas;
-- drop table if exists vendas_planilhas_importacoes;
