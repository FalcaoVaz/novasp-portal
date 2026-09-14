-- ═══════════════════════════════════════════════════════════════
-- RECUPERACAO — forum de representantes + cadastro de corretores
-- 06/08/2026. Rodar bloco a bloco no SQL Editor.
--
-- Contexto: as 5 tabelas vendas_forum_* e a vendas_corretores foram
-- encontradas VAZIAS em 06/08 (deteccao ao investigar "pessoal nao
-- acessa o forum"). Nao ha backup (plano Free). Este script restaura
-- o ciclo atual e o seed dos corretores; topicos/comentarios/votos
-- antigos nao sao recuperaveis.
-- ═══════════════════════════════════════════════════════════════

-- 1) Ciclo atual do forum (2026-Q3) — sem ele o forum mostra
--    "Sem ciclo carregado" pra todo mundo
insert into vendas_forum_ciclos (trimestre, ano, encerrado)
select 3, 2026, false
where not exists (select 1 from vendas_forum_ciclos where trimestre = 3 and ano = 2026);

-- 2) Corretores por equipe (seed original de corretores_editaveis.sql;
--    quem foi adicionado depois pelo portal precisa ser recadastrado
--    pelas assistentes/gerentes)
INSERT INTO vendas_corretores (nome, equipe) VALUES
  -- AGUIA
  ('Sandra Bernardes','Aguia'), ('Nina','Aguia'), ('Fabio Ayres','Aguia'),
  ('Hellen Queiroz','Aguia'), ('Dirce','Aguia'), ('Tatiana','Aguia'),
  ('Amelia Fuji','Aguia'), ('Akemi','Aguia'), ('Domenica','Aguia'),
  ('Barbosa','Aguia'), ('Helio','Aguia'), ('Jane','Aguia'), ('Evita','Aguia'),
  -- CHRIS
  ('Suely','Chris'), ('Solange','Chris'), ('Olympia','Chris'), ('Luisa','Chris'),
  ('Norberto','Chris'), ('Christiane','Chris'), ('Ana','Chris'), ('Nilson','Chris'),
  ('Claudia França','Chris'), ('Ricardo Kraut','Chris'), ('Gabriela Roza','Chris'),
  ('Wagner Daniele','Chris'), ('Leandrinni','Chris'), ('Karina','Chris'),
  ('Viviane','Chris'), ('Gonzalo','Chris'), ('Alencar','Chris'),
  -- EMILIA
  ('Eva','Emilia'), ('Clara','Emilia'), ('Maria','Emilia'),
  ('Alexandre Silva','Emilia'), ('Heloisa','Emilia'), ('Tania','Emilia'),
  ('Moacir','Emilia'), ('Elson','Emilia'), ('Naldo','Emilia'),
  ('Marilda','Emilia'), ('Amanda','Emilia'), ('Emilia Vitória','Emilia'),
  ('Beto','Emilia'), ('Mayza','Emilia'), ('Noemi','Emilia'),
  ('Patricia','Emilia'), ('Aragon','Emilia'),
  -- FELIPPE
  ('Gilmar Bancaro','Felippe'), ('Amauri','Felippe'), ('Rosangela','Felippe'),
  ('Adolfo Rizzi','Felippe'), ('Luzinete','Felippe'), ('Neusa','Felippe'),
  ('Marcia','Felippe'), ('Luzia','Felippe'), ('Claudio Norte','Felippe'),
  ('Wellington','Felippe'), ('Claudete Causfer','Felippe'), ('Lucio','Felippe'),
  ('Felippe Lemos','Felippe'), ('Hevana','Felippe'), ('Ellen Moreira','Felippe'),
  ('Selena','Felippe'), ('Camille','Felippe'), ('Duda','Felippe'),
  ('Chang','Felippe'), ('Monica','Felippe'), ('Betta','Felippe'),
  -- FENIX
  ('Rachel Saez','Fenix'), ('Andreia Carvalho','Fenix'), ('Kali','Fenix'),
  ('Regina','Fenix'), ('Thiago','Fenix'), ('Margara','Fenix'),
  ('Lucila','Fenix'), ('Magali','Fenix'), ('Willian','Fenix')
ON CONFLICT DO NOTHING;

-- 3) Conferencia
select 'ciclos' as tabela, count(*) from vendas_forum_ciclos
union all select 'corretores', count(*) from vendas_corretores where ativo
union all select 'topicos', count(*) from vendas_forum_topicos;
