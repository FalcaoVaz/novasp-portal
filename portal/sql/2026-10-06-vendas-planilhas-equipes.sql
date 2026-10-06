-- ═══════════════════════════════════════════════════════════════
-- Planilha Mensal por EQUIPE — várias equipes por mês (pedido do Anderson, 06/10/2026)
-- Cada assistente grava a planilha da sua equipe; vale a mais recente de cada (mês, equipe)
-- e os sub-módulos juntam todas. RODAR ANTES de publicar o portal com 18-vendas-planilhas.js?v=20261006a
-- (o JS novo grava a coluna equipe).
--
-- Diferença para o 002 do Anderson: o passo 3 dele (políticas de insert com importado_por = auth.uid())
-- NÃO entra. Neste portal importado_por é usuarios.id (CUR.id), que não é o auth.uid() do GoTrue, e as
-- duas tabelas já têm a política "acesso_autenticado" (for all to authenticated). Conferido em produção
-- em 06/10: todas as assistentes têm conta no Supabase Auth e logaram recentemente. Não era o banco que
-- recusava; o botão de importar só aparece para quem está em podeImportarPlanilhaVendas() (02-manutencao.js).
-- ═══════════════════════════════════════════════════════════════
begin;

-- 1) Equipe na importação
alter table vendas_planilhas_importacoes add column if not exists equipe text;

-- 2) Importações que já existem: equipe pela coluna Equipe das abas CAPTAÇÃO E PLACAS / VENDIDOS SELEÇÃO
--    (Camille 06/10 → FELIPPE; teste do Anderson de set/2026 → TESTE)
update vendas_planilhas_importacoes i
   set equipe = upper(trim(regexp_replace(sub.eq, '^\s*equipe\s+', '', 'i')))
  from (select importacao_id, max(equipe) eq
          from vendas_planilhas_linhas
         where equipe is not null and submodulo in ('captacao_placas', 'vendidos_selecao')
         group by importacao_id) sub
 where sub.importacao_id = i.id and i.equipe is null;

-- Linhas antigas no mesmo padrão do JS ("Equipe Felippe" / "Felippe" → "FELIPPE")
update vendas_planilhas_linhas
   set equipe = upper(trim(regexp_replace(equipe, '^\s*equipe\s+', '', 'i')))
 where equipe is not null and equipe <> upper(trim(regexp_replace(equipe, '^\s*equipe\s+', '', 'i')));

-- Linhas de cota (a aba não tem coluna Equipe) herdam a equipe da importação
update vendas_planilhas_linhas l
   set equipe = i.equipe
  from vendas_planilhas_importacoes i
 where l.importacao_id = i.id and l.equipe is null and i.equipe is not null;

create index if not exists idx_vpi_mes_eq on vendas_planilhas_importacoes (mes_ref, equipe, importado_em desc);

commit;

-- Conferência (esperado: FELIPPE 1 e TESTE 1):
select equipe, count(*) from vendas_planilhas_importacoes group by 1 order by 1;
