-- ═══════════════════════════════════════════════════════════════
-- CORRECAO — leva da Emilia entrou como ciclo 2026-07 em vez de
-- 2026-08 (08/08/2026). Causa: o modal de upload pre-preenchia o mes
-- com o pivo do dia 10 (_cicloAtualYm = julho ate 09/08); a assistente
-- da Emilia confiou no default, as demais corrigiram na mao.
-- O v51 muda o default pro mes calendario.
-- Afeta exatamente 20 registros (16 aprovados + 4 reprovados),
-- todos criados a partir de 01/08. Rodar bloco a bloco.
-- ═══════════════════════════════════════════════════════════════

-- 1) Conferencia previa (esperado: 20 linhas)
select codigo, status, criado_em::date
from vendas_selecao_imoveis
where equipe = 'Emilia' and mes_referencia = '2026-07'
  and criado_em >= '2026-08-01'
order by criado_em;

-- 2) Correcao
update vendas_selecao_imoveis
set mes_referencia = '2026-08'
where equipe = 'Emilia' and mes_referencia = '2026-07'
  and criado_em >= '2026-08-01';

-- 3) Conferencia final (Emilia deve aparecer com a leva em 2026-08)
select mes_referencia, status, count(*)
from vendas_selecao_imoveis
where equipe = 'Emilia'
group by 1, 2 order by 1 desc, 2;
