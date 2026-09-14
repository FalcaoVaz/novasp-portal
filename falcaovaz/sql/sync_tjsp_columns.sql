-- Patch para sincronizacao TJSP-DataJud
-- Adiciona colunas para controle de sync em processos
-- e marca origem do andamento em andamentos_processos

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS ultima_sync_cnj TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultimo_mov_cnj  TIMESTAMPTZ;

ALTER TABLE andamentos_processos
  ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'manual';

-- Verificacao
SELECT
  (SELECT COUNT(*) FROM processos WHERE numero IS NOT NULL AND TRIM(numero) <> '') AS processos_com_numero,
  (SELECT COUNT(*) FROM processos WHERE ultimo_mov_cnj IS NOT NULL)                AS ja_sincronizados,
  (SELECT COUNT(*) FROM andamentos_processos WHERE origem='tjsp-datajud')          AS andamentos_automatic;
