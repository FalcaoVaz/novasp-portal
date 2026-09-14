-- Disponibilidade extra aberta pelo próprio fotógrafo (dias/horários fora
-- da pauta padrão terça/quarta). Um registro representa um bloco disponível
-- num dia — pode ser janela curta (17-19h) ou dia inteiro (8-18h).
-- Gerentes veem esses blocos como sugestões pra agendar em dias extras.

CREATE TABLE IF NOT EXISTS vendas_fotografo_disponibilidade (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data           date NOT NULL,
  hora_inicio    time NOT NULL,
  hora_fim       time NOT NULL,
  regiao         text,
  observacoes    text,
  criado_por     text,
  criado_em      timestamptz DEFAULT now(),
  CONSTRAINT chk_horas CHECK (hora_fim > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_foto_disp_data
  ON vendas_fotografo_disponibilidade (data);

-- Sem RLS por enquanto (mesmo padrão das outras tabelas do módulo Vendas).
-- Permissão de escrita/remoção é feita no frontend (só o Fotografo abre/remove).
