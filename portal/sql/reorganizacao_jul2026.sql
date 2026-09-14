-- Reorganização jul/2026:
--  * Regina e Catia sairam → bloquear login (coluna ativo)
--  * Renata deixa de ser superintendente → dept Gerente de Vendas
--  * Gerentes (Renata, Felippe, Christiane, Emilia) reportam direto ao Rodrigo
--    → vinculos em gestao_liderados
-- Rode bloco a bloco e confira o resultado de cada um.

-- ═══════════════════════════════════════════════════════════
-- PASSO 0 — diagnostico: acha Regina / Catia / Renata / Rodrigo
-- ═══════════════════════════════════════════════════════════
SELECT id, nome, email, dept, admin
FROM usuarios
WHERE nome ILIKE '%regina%' OR nome ILIKE '%catia%' OR nome ILIKE '%cátia%'
   OR nome ILIKE '%renata%' OR admin = true;

-- ═══════════════════════════════════════════════════════════
-- PASSO 1 — coluna ativo (bloqueia login de quem saiu)
-- ═══════════════════════════════════════════════════════════
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo boolean DEFAULT true;

UPDATE usuarios SET ativo = false
WHERE nome ILIKE '%regina%' OR nome ILIKE '%catia%' OR nome ILIKE '%cátia%';

-- ═══════════════════════════════════════════════════════════
-- PASSO 2 — Renata: dept vira Gerente de Vendas
-- ═══════════════════════════════════════════════════════════
UPDATE usuarios SET dept = 'Gerente de Vendas'
WHERE nome ILIKE '%renata%' AND ativo = true;

-- ═══════════════════════════════════════════════════════════
-- PASSO 3 — desativa vinculos de lideranca de Regina/Catia
-- (liderados delas ficam soltos ate serem revinculados)
-- ═══════════════════════════════════════════════════════════
UPDATE gestao_liderados SET ativo = false, data_fim = CURRENT_DATE
WHERE ativo = true
  AND lider_id IN (
    SELECT id FROM usuarios
    WHERE nome ILIKE '%regina%' OR nome ILIKE '%catia%' OR nome ILIKE '%cátia%'
  );

-- ═══════════════════════════════════════════════════════════
-- PASSO 4 — gerentes reportam direto ao Rodrigo (admin)
-- Cria/reativa vinculo Rodrigo → cada gerente.
-- ═══════════════════════════════════════════════════════════
WITH rodrigo AS (SELECT id FROM usuarios WHERE admin = true LIMIT 1),
     gerentes AS (
       SELECT id FROM usuarios
       WHERE ativo = true
         AND (nome ILIKE '%renata%' OR nome ILIKE '%felippe%'
              OR nome ILIKE '%christiane%' OR nome ILIKE '%emilia%')
     )
INSERT INTO gestao_liderados (lider_id, colaborador_id, ativo, data_inicio)
SELECT r.id, g.id, true, CURRENT_DATE
FROM rodrigo r CROSS JOIN gerentes g
WHERE NOT EXISTS (
  SELECT 1 FROM gestao_liderados gl
  WHERE gl.lider_id = r.id AND gl.colaborador_id = g.id AND gl.ativo = true
);

-- Desativa vinculos antigos dos gerentes com OUTROS lideres (ex: Regina)
UPDATE gestao_liderados SET ativo = false, data_fim = CURRENT_DATE
WHERE ativo = true
  AND colaborador_id IN (
    SELECT id FROM usuarios
    WHERE ativo = true
      AND (nome ILIKE '%renata%' OR nome ILIKE '%felippe%'
           OR nome ILIKE '%christiane%' OR nome ILIKE '%emilia%')
  )
  AND lider_id != (SELECT id FROM usuarios WHERE admin = true LIMIT 1);

-- ═══════════════════════════════════════════════════════════
-- PASSO 5 — verificacao final
-- ═══════════════════════════════════════════════════════════
SELECT l.nome AS lider, c.nome AS colaborador, gl.data_inicio
FROM gestao_liderados gl
JOIN usuarios l ON l.id = gl.lider_id
JOIN usuarios c ON c.id = gl.colaborador_id
WHERE gl.ativo = true
ORDER BY l.nome, c.nome;
