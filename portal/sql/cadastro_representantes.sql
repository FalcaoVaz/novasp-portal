-- Cadastra os 5 corretores representantes das equipes.
-- Sem senha_hash → primeiro acesso vai pedir que definam a propria senha.
-- Todos os acessos externos ao Forum ficam desligados (rep puro).
-- Rodar no SQL Editor do Supabase.

-- Passo 1: diagnostico — mostra se algum ja existe
SELECT id, nome, email
FROM usuarios
WHERE email IN (
  'ricardo.angerami@novasaopaulo.com.br',
  'maria.matias@novasaopaulo.com.br',
  'domenica@novasaopaulo.com.br',
  'willian@novasaopaulo.com.br',
  'won.chang@novasaopaulo.com.br'
);

-- Passo 2: cria os que nao existem
INSERT INTO usuarios (
  nome, email, dept, nivel, judicial, admin,
  acesso_juridico, acesso_interno, acesso_calendar,
  cor_avatar, primeiro_acesso, quota_tokens, tokens_usados
)
SELECT * FROM (VALUES
  ('Ricardo Angerami', 'ricardo.angerami@novasaopaulo.com.br',
   'Corretor Chris', 2, false, false, false, false, false,
   '#3B82F6', true, 100000, 0),
  ('Maria Matias', 'maria.matias@novasaopaulo.com.br',
   'Corretor Emilia', 2, false, false, false, false, false,
   '#EC4899', true, 100000, 0),
  ('Domenica', 'domenica@novasaopaulo.com.br',
   'Corretor Aguia', 2, false, false, false, false, false,
   '#F59E0B', true, 100000, 0),
  ('Willian', 'willian@novasaopaulo.com.br',
   'Corretor Fenix', 2, false, false, false, false, false,
   '#10B981', true, 100000, 0),
  ('Won Chang', 'won.chang@novasaopaulo.com.br',
   'Corretor Felippe', 2, false, false, false, false, false,
   '#8B5CF6', true, 100000, 0)
) AS v(nome, email, dept, nivel, judicial, admin,
       acesso_juridico, acesso_interno, acesso_calendar,
       cor_avatar, primeiro_acesso, quota_tokens, tokens_usados)
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios u WHERE u.email = v.email
);

-- Passo 3: se ja existir usuario com esse email mas com acessos antigos
-- (raro), zera os acessos externos ao Forum. Comente as linhas se quiser
-- preservar acessos existentes.
-- UPDATE usuarios
-- SET acesso_juridico = false,
--     acesso_interno = false,
--     acesso_calendar = false
-- WHERE email IN (
--   'ricardo.angerami@novasaopaulo.com.br',
--   'maria.matias@novasaopaulo.com.br',
--   'domenica@novasaopaulo.com.br',
--   'willian@novasaopaulo.com.br',
--   'won.chang@novasaopaulo.com.br'
-- );

-- Passo 4: verificacao final
SELECT nome, email, dept, primeiro_acesso, senha_hash IS NULL AS sem_senha
FROM usuarios
WHERE email IN (
  'ricardo.angerami@novasaopaulo.com.br',
  'maria.matias@novasaopaulo.com.br',
  'domenica@novasaopaulo.com.br',
  'willian@novasaopaulo.com.br',
  'won.chang@novasaopaulo.com.br'
)
ORDER BY dept;
