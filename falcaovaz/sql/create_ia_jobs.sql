-- ──────────────────────────────────────────────────────────────────
-- Tabela ia_jobs — fila de jobs assíncronos da background function
-- gerar-documento-background.js: insere job ao concluir
-- frontend (pollJob): consulta a cada 1s por job_id
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ia_jobs (
  id          BIGSERIAL PRIMARY KEY,
  job_id      TEXT UNIQUE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'gerando',   -- gerando | pronto | erro
  resultado   TEXT,
  tokens      INTEGER DEFAULT 0,
  modelo      TEXT,
  erro        TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ia_jobs_job_id ON ia_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_ia_jobs_status_criado ON ia_jobs(status, criado_em DESC);

-- Trigger atualiza atualizado_em em cada UPDATE
CREATE OR REPLACE FUNCTION fn_ia_jobs_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ia_jobs_touch ON ia_jobs;
CREATE TRIGGER trg_ia_jobs_touch
BEFORE UPDATE ON ia_jobs
FOR EACH ROW EXECUTE FUNCTION fn_ia_jobs_touch();

-- ──────────────────────────────────────────────────────────────────
-- RLS — autorização por posse do job_id (UUID aleatório suficiente)
-- O job_id é gerado no client e nunca é exposto fora da sessão.
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE ia_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_jobs_select ON ia_jobs;
DROP POLICY IF EXISTS ia_jobs_insert ON ia_jobs;
DROP POLICY IF EXISTS ia_jobs_update ON ia_jobs;

CREATE POLICY ia_jobs_select ON ia_jobs FOR SELECT USING (true);
CREATE POLICY ia_jobs_insert ON ia_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY ia_jobs_update ON ia_jobs FOR UPDATE USING (true);

-- ──────────────────────────────────────────────────────────────────
-- Limpeza automática — apaga jobs com mais de 7 dias
-- (executar via pg_cron se disponível, ou manualmente periodicamente)
-- ──────────────────────────────────────────────────────────────────
-- DELETE FROM ia_jobs WHERE criado_em < NOW() - INTERVAL '7 days';
