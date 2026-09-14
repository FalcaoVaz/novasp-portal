-- Ciclo mensal da selecao de imoveis. Ciclos comecam sempre no dia 10
-- do mes. Um imovel do ciclo "M" fica ativo ate o dia 9 do mes (M+3).
-- Ex: mes_ref 2026-09 => ativo ate 2026-12-09.
--
-- ativo_ate eh usado APENAS pra o imovel "cair" (expirar) na virada
-- do ciclo. Na tela e no PDF a gente mostra so o mes_referencia.

-- ═════════════════════════════════════════════════════════════
-- PASSO 1 — Classifica os APROVADOS existentes por mes_referencia
-- ═════════════════════════════════════════════════════════════
--
--   * "ULTIMOS aprovados" (aprovados desde 10/07/2026)  → mes_ref 2026-07
--   * "ANTERIORES" (aprovados antes de 10/07/2026)      → mes_ref 2026-06
--
-- Roda os 2 UPDATEs abaixo. Depois roda o Passo 2 pra recalcular ativo_ate.

-- Anteriores (antes do ciclo de julho/2026 começar) → junho/2026
UPDATE vendas_selecao_imoveis
SET mes_referencia = '2026-06'
WHERE status = 'aprovado'
  AND (aprovado_em IS NULL OR aprovado_em < '2026-07-10');

-- Últimos aprovados (a partir de 10/07/2026, início do ciclo) → julho/2026
UPDATE vendas_selecao_imoveis
SET mes_referencia = '2026-07'
WHERE status = 'aprovado'
  AND aprovado_em >= '2026-07-10';

-- ═════════════════════════════════════════════════════════════
-- PASSO 2 — Recalcula ativo_ate a partir do mes_referencia
-- ═════════════════════════════════════════════════════════════
-- Formula: dia 10 do mes de referencia + 3 meses - 1 dia = dia 9 do (M+3)
UPDATE vendas_selecao_imoveis
SET ativo_ate = (
  to_date(mes_referencia || '-10', 'YYYY-MM-DD')
  + interval '3 months'
  - interval '1 day'
)::date
WHERE status = 'aprovado'
  AND mes_referencia ~ '^\d{4}-\d{2}$';

-- ═════════════════════════════════════════════════════════════
-- PASSO 3 — Verificação (mostra o que ficou)
-- ═════════════════════════════════════════════════════════════
SELECT mes_referencia, COUNT(*) as qtd, MIN(ativo_ate) as expira
FROM vendas_selecao_imoveis
WHERE status = 'aprovado'
GROUP BY mes_referencia
ORDER BY mes_referencia DESC;
