-- ═══════════════════════════════════════════════════════════════
-- Seleção de Imóveis — correção de 16/10/2026 (Rodrigo):
-- 1) Águia e Fênix enviadas pela Leticia em 06/10 (14 + 6 imóveis) foram gravadas no ciclo de SETEMBRO e por isso não
--    aparecem na tela de outubro. Passam para o ciclo de OUTUBRO, com a mesma validade dos outros de outubro (09/01/2027).
-- 2) MO18241 (Águia, pendente desde 04/09) sai da seleção: status "removido", com o motivo nas observações.
-- ═══════════════════════════════════════════════════════════════
begin;

update vendas_selecao_imoveis
   set mes_referencia = '2026-10',
       ativo_ate = case when ativo_ate is not null then date '2027-01-09' end,
       atualizado_em = now()
 where equipe in ('Aguia', 'Fenix') and mes_referencia = '2026-09'
   and enviado_em >= '2026-10-06' and enviado_em < '2026-10-07';            -- esperado: 20 linhas

update vendas_selecao_imoveis
   set status = 'removido',
       observacoes = coalesce(observacoes || ' · ', '') || 'Retirado da seleção em 16/10/2026 a pedido do Rodrigo (não deveria ter entrado).',
       atualizado_em = now()
 where id = '015bad7a-e85e-4b49-8562-866bff77559d' and codigo = 'MO18241';   -- esperado: 1 linha

commit;

-- Conferência
select equipe, mes_referencia, status, count(*) from vendas_selecao_imoveis
 where mes_referencia = '2026-10' group by 1, 2, 3 order by 1, 3;
select codigo, status, observacoes from vendas_selecao_imoveis where codigo = 'MO18241';
