-- Patch v2 do modulo Gestao: adiciona perguntas de desenvolvimento/pontos de melhoria
-- Rodar no SQL Editor do Supabase apos modulo_gestao.sql

INSERT INTO gestao_perguntas (ordem, bloco, pergunta, tipo, obrigatoria) VALUES
  (60,'desenvolvimento','Pontos fortes a manter no próximo período','texto',false),
  (61,'desenvolvimento','Pontos de melhoria para o próximo período','texto',true),
  (62,'desenvolvimento','Ações de desenvolvimento sugeridas (cursos, treinamentos, leituras)','texto',false),
  (63,'desenvolvimento','Compromissos do colaborador para o próximo trimestre','texto',false)
ON CONFLICT DO NOTHING;

SELECT id, ordem, bloco, pergunta FROM gestao_perguntas WHERE bloco='desenvolvimento' ORDER BY ordem;
