-- Corretores por equipe — tabela editavel pra assistentes/gerentes adicionarem
-- novos corretores sem precisar de deploy. O JS le direto do banco (com cache
-- em memoria) e cai no fallback da constante CORRETORES_POR_EQUIPE se der erro.

CREATE TABLE IF NOT EXISTS vendas_corretores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  equipe        text NOT NULL,
  ativo         boolean DEFAULT true,
  criado_em     timestamptz DEFAULT now(),
  criado_por    text,
  atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT chk_equipe CHECK (equipe IN ('Aguia','Chris','Emilia','Felippe','Fenix'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_corretor_por_equipe
  ON vendas_corretores (equipe, lower(nome)) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS idx_corretor_equipe ON vendas_corretores (equipe, ativo);

-- SEED inicial: transfere a lista atual do JS pra tabela (ON CONFLICT ignora
-- se ja rodou antes)
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

-- Verificacao
SELECT equipe, COUNT(*) FROM vendas_corretores WHERE ativo GROUP BY equipe ORDER BY equipe;
