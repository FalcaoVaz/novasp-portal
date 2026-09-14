-- Votacao estilo peneira: cada representante vota aprovar/reprovar.
-- 3+ aprovacoes = decidido aprovado. 3+ reprovacoes = decidido reprovado.
-- Priorizacao ⭐ existente continua (ordenar pauta de reuniao).

CREATE TABLE IF NOT EXISTS vendas_forum_votos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topico_id   uuid NOT NULL REFERENCES vendas_forum_topicos(id) ON DELETE CASCADE,
  autor_nome  text NOT NULL,
  voto        text NOT NULL CHECK (voto IN ('aprovar','reprovar')),
  criado_em   timestamptz DEFAULT now(),
  UNIQUE (topico_id, autor_nome)
);
CREATE INDEX IF NOT EXISTS idx_forum_votos_topico
  ON vendas_forum_votos (topico_id);

-- Campo pra guardar decisao automatica (independente do status manual)
ALTER TABLE vendas_forum_topicos
  ADD COLUMN IF NOT EXISTS decisao_votacao text
  CHECK (decisao_votacao IN ('aprovado','reprovado'));

-- Tipo do topico: 'votacao' pede aprovar/reprovar, 'discussao' so debate.
ALTER TABLE vendas_forum_topicos
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'votacao'
  CHECK (tipo IN ('votacao','discussao'));
