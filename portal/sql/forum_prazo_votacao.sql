-- Prazo pra votacao de topicos do forum. Depois desta data:
--   - botoes de voto ficam bloqueados
--   - se atingiu quorum, decisao ja esta gravada (fica valida)
--   - se nao atingiu, aparece badge "prazo vencido — sem decisao"
-- Aplica-se so a topicos do tipo 'votacao'. Discussao ignora.

ALTER TABLE vendas_forum_topicos
  ADD COLUMN IF NOT EXISTS prazo_votacao date;
