-- Fórum dos Representantes — reuniões trimestrais dos corretores
-- representantes de cada equipe. Fluxo:
--   1. Gerente/representante propõe tópico durante o trimestre
--   2. Outros representantes/gerentes comentam e apoiam (👍)
--   3. Após a reunião, gerente adiciona "deliberação" e move status
--
-- Acesso restrito no frontend (5 representantes + gerentes + admin).

-- Ciclo trimestral (Q1..Q4 + ano + data reunião)
CREATE TABLE IF NOT EXISTS vendas_forum_ciclos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trimestre     smallint NOT NULL,          -- 1..4
  ano           smallint NOT NULL,
  data_reuniao  date,
  encerrado     boolean DEFAULT false,
  criado_em     timestamptz DEFAULT now(),
  UNIQUE (trimestre, ano),
  CONSTRAINT chk_trim CHECK (trimestre BETWEEN 1 AND 4)
);

-- Tópicos da pauta
CREATE TABLE IF NOT EXISTS vendas_forum_topicos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trimestre     smallint NOT NULL,
  ano           smallint NOT NULL,
  titulo        text NOT NULL,
  descricao     text,
  tag           text,                       -- 'comissao'|'treinamento'|'processos'|'ferramentas'|'clima'|'outros'
  status        text DEFAULT 'proposta',    -- 'proposta'|'em_debate'|'decidido'|'arquivado'
  deliberacao   text,                       -- preenchida após reunião
  autor_nome    text,
  autor_equipe  text,
  criado_em     timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT chk_trim2 CHECK (trimestre BETWEEN 1 AND 4)
);
CREATE INDEX IF NOT EXISTS idx_forum_top_trim
  ON vendas_forum_topicos (ano DESC, trimestre DESC);
CREATE INDEX IF NOT EXISTS idx_forum_top_status
  ON vendas_forum_topicos (status);

-- Comentários (thread)
CREATE TABLE IF NOT EXISTS vendas_forum_comentarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topico_id     uuid NOT NULL REFERENCES vendas_forum_topicos(id) ON DELETE CASCADE,
  texto         text NOT NULL,
  autor_nome    text,
  autor_equipe  text,
  criado_em     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forum_com_topico
  ON vendas_forum_comentarios (topico_id, criado_em);

-- Apoios (👍) — um por autor por tópico
CREATE TABLE IF NOT EXISTS vendas_forum_apoios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topico_id     uuid NOT NULL REFERENCES vendas_forum_topicos(id) ON DELETE CASCADE,
  autor_nome    text NOT NULL,
  criado_em     timestamptz DEFAULT now(),
  UNIQUE (topico_id, autor_nome)
);
