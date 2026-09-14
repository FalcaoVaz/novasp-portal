-- Modulo Gestao — schema completo
-- Rodar no SQL Editor do Supabase

-- 1) Relacao lider-liderado (1 colaborador pode ter so 1 lider direto)
CREATE TABLE IF NOT EXISTS gestao_liderados (
  id BIGSERIAL PRIMARY KEY,
  lider_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ativo BOOLEAN DEFAULT TRUE,
  data_inicio DATE DEFAULT CURRENT_DATE,
  data_fim DATE,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(colaborador_id)
);
CREATE INDEX IF NOT EXISTS idx_gestao_liderados_lider ON gestao_liderados(lider_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_gestao_liderados_colab ON gestao_liderados(colaborador_id) WHERE ativo;

-- 2) Perguntas configuraveis (base universal + custom por lider)
CREATE TABLE IF NOT EXISTS gestao_perguntas (
  id BIGSERIAL PRIMARY KEY,
  ordem INTEGER DEFAULT 0,
  bloco TEXT NOT NULL,             -- 'comprometimento','qualidade','relacionamento','reflexao','plano','custom'
  pergunta TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'escala',  -- 'escala'(1-5),'texto','sim_nao'
  obrigatoria BOOLEAN DEFAULT TRUE,
  -- escopo: se NULL = universal (todos), se preenchido = so para esse colaborador
  colaborador_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_por UUID REFERENCES usuarios(id),
  ativa BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_perguntas_colab ON gestao_perguntas(colaborador_id) WHERE ativa;

-- 3) Avaliacoes mensais do colaborador (preenchida pelo lider)
CREATE TABLE IF NOT EXISTS gestao_avaliacoes (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  lider_id UUID NOT NULL REFERENCES usuarios(id),
  periodo TEXT NOT NULL,           -- 'YYYY-MM' ou 'YYYY-Qn'
  respostas JSONB DEFAULT '{}'::jsonb,   -- {pergunta_id: valor}
  observacoes TEXT,
  status TEXT DEFAULT 'rascunho',  -- 'rascunho','finalizada'
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  finalizada_em TIMESTAMPTZ,
  UNIQUE(colaborador_id, periodo)
);
CREATE INDEX IF NOT EXISTS idx_gestao_avaliacoes_colab ON gestao_avaliacoes(colaborador_id, periodo DESC);
CREATE INDEX IF NOT EXISTS idx_gestao_avaliacoes_lider ON gestao_avaliacoes(lider_id, periodo DESC);

-- 4) Tarefas/Metas para calculo de bonus (modelo da planilha Leticia)
CREATE TABLE IF NOT EXISTS gestao_tarefas_bonus (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ordem INTEGER DEFAULT 0,
  descricao TEXT NOT NULL,
  pontos_max INTEGER NOT NULL DEFAULT 0,
  frequencia TEXT,                 -- 'Diario','Semanal','Mensal','Sob Demanda'
  ativa BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gestao_tarefas_colab ON gestao_tarefas_bonus(colaborador_id) WHERE ativa;

-- 5) Configuracao de bonus por colaborador
CREATE TABLE IF NOT EXISTS gestao_bonus_config (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id UUID UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ativo BOOLEAN DEFAULT FALSE,
  valor_max NUMERIC(10,2) DEFAULT 0,
  pontos_max INTEGER DEFAULT 0,
  periodicidade TEXT DEFAULT 'mensal',
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 6) Bonus calculados (avaliacao das tarefas em um periodo)
CREATE TABLE IF NOT EXISTS gestao_bonus_apuracoes (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL,                    -- 'YYYY-MM' ou 'YYYY-Qn'
  pontuacao JSONB DEFAULT '{}'::jsonb,      -- {tarefa_id: pontos_atingidos}
  pontos_total INTEGER DEFAULT 0,
  pontos_max INTEGER DEFAULT 0,
  valor_calculado NUMERIC(10,2) DEFAULT 0,
  pago BOOLEAN DEFAULT FALSE,
  data_pagamento DATE,
  observacoes TEXT,
  status TEXT DEFAULT 'rascunho',           -- 'rascunho','finalizado','pago'
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  UNIQUE(colaborador_id, periodo)
);
CREATE INDEX IF NOT EXISTS idx_gestao_bonus_apur_colab ON gestao_bonus_apuracoes(colaborador_id, periodo DESC);

-- 7) Avaliacao do lider (360 simples — colaborador avalia o lider)
CREATE TABLE IF NOT EXISTS gestao_avaliacoes_lider (
  id BIGSERIAL PRIMARY KEY,
  lider_id UUID NOT NULL REFERENCES usuarios(id),
  colaborador_id UUID NOT NULL REFERENCES usuarios(id),
  periodo TEXT NOT NULL,
  respostas JSONB DEFAULT '{}'::jsonb,
  observacoes TEXT,
  anonimo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lider_id, colaborador_id, periodo)
);

-- 8) Perguntas para avaliacao do lider (360)
CREATE TABLE IF NOT EXISTS gestao_perguntas_lider (
  id BIGSERIAL PRIMARY KEY,
  ordem INTEGER DEFAULT 0,
  pergunta TEXT NOT NULL,
  tipo TEXT DEFAULT 'escala',
  ativa BOOLEAN DEFAULT TRUE
);

-- Popula perguntas padrao (universais — Bloco A, B, C, D, E)
INSERT INTO gestao_perguntas (ordem, bloco, pergunta, tipo, obrigatoria) VALUES
  (10,'comprometimento','Cumpre prazos e compromissos acordados','escala',true),
  (11,'comprometimento','Toma iniciativa diante de problemas','escala',true),
  (12,'comprometimento','Postura profissional (pontualidade, apresentacao, comportamento)','escala',true),
  (13,'comprometimento','Adapta-se a mudancas e novas demandas','escala',true),
  (20,'qualidade','Entrega trabalho com qualidade esperada','escala',true),
  (21,'qualidade','Atencao a detalhes e precisao','escala',true),
  (22,'qualidade','Capacidade de resolver problemas com autonomia','escala',true),
  (23,'qualidade','Organizacao e gestao do proprio tempo','escala',true),
  (30,'relacionamento','Colabora com colegas de equipe','escala',true),
  (31,'relacionamento','Comunicacao clara (oral e escrita)','escala',true),
  (32,'relacionamento','Relacionamento com clientes/parceiros externos','escala',true),
  (33,'relacionamento','Receptividade a feedback','escala',true),
  (40,'reflexao','Principais conquistas/entregas do mes','texto',false),
  (41,'reflexao','Maiores desafios enfrentados','texto',false),
  (42,'reflexao','O que precisa melhorar / desenvolver','texto',false),
  (43,'reflexao','Apoio que espera do lider no proximo mes','texto',false),
  (50,'plano','Metas/foco para o proximo mes','texto',false),
  (51,'plano','Compromissos do lider com o colaborador','texto',false)
ON CONFLICT DO NOTHING;

-- Popula perguntas padrao para avaliacao do lider (360 simples)
INSERT INTO gestao_perguntas_lider (ordem, pergunta, tipo) VALUES
  (10,'Da feedback claro e construtivo','escala'),
  (20,'E acessivel quando preciso de apoio','escala'),
  (30,'Reconhece e valoriza o trabalho da equipe','escala'),
  (40,'Comunica objetivos e prioridades de forma clara','escala'),
  (50,'Promove um ambiente de respeito e colaboracao','escala'),
  (60,'Apoia o desenvolvimento profissional dos liderados','escala'),
  (70,'Comentarios livres (anonimos) sobre o lider','texto')
ON CONFLICT DO NOTHING;

-- RLS — permissive para anon key (autorizacao real fica no frontend baseada em currentUser)
ALTER TABLE gestao_liderados        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestao_perguntas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestao_avaliacoes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestao_tarefas_bonus    ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestao_bonus_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestao_bonus_apuracoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestao_avaliacoes_lider ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestao_perguntas_lider  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'gestao_liderados','gestao_perguntas','gestao_avaliacoes',
    'gestao_tarefas_bonus','gestao_bonus_config','gestao_bonus_apuracoes',
    'gestao_avaliacoes_lider','gestao_perguntas_lider'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_all ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_all ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
