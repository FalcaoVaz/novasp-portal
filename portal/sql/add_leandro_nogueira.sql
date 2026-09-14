-- Adiciona ou atualiza o usuario Leandro Nogueira no portal Nova SP
-- Rodar no SQL Editor do Supabase (pode rodar tudo de uma vez)

-- Passo 1: diagnostico (mostra se ja existe algum Nogueira)
SELECT id, nome, dept, nivel, judicial, admin
FROM usuarios
WHERE nome ILIKE '%nogueira%';

-- Passo 2: cria novo registro se nao existir nenhum Nogueira
INSERT INTO usuarios (
  nome, email, dept, nivel, judicial, admin,
  acesso_juridico, acesso_interno, acesso_calendar,
  cor_avatar, primeiro_acesso, quota_tokens, tokens_usados
)
SELECT
  'Leandro Nogueira', 'leandro.nogueira@novasaopaulo.com.br',
  'Administrativo', 2, false, false,
  true, true, true,
  '#1E4D99', true, 200000, 0
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios WHERE nome ILIKE '%nogueira%'
);

-- Passo 3: renomeia para "Leandro Nogueira" se ja existir com outro nome
UPDATE usuarios
SET nome = 'Leandro Nogueira'
WHERE nome ILIKE '%nogueira%'
  AND nome <> 'Leandro Nogueira';

-- Passo 4: verificacao final
SELECT id, nome, dept, nivel, judicial, admin,
       acesso_juridico, acesso_interno, acesso_calendar
FROM usuarios
WHERE nome = 'Leandro Nogueira';
