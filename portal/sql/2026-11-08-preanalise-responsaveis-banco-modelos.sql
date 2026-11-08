-- ═══════════════════════════════════════════════════════════════
-- PRÉ-ANÁLISE — novidades do pacote da Renata de 07/11 (08/11/2026)
-- • Responsáveis da venda (gerente, assistente, corretor). A data do envio da proposta e a do envio dos
--   documentos ao banco são marcos (coluna marcos, já existe: chaves proposta_enviada e docs_banco).
-- • Prazos do banco (vendas com financiamento/FGTS: Modelos 1, 3 e 4): dias para enviar os documentos
--   (contados do contrato assinado) e dias para o banco devolver (contados do envio). Vazio = padrão do modelo.
-- • Novos tipos de documento nos protocolos (procuração, declarações e formulários da NSP).
-- Rodar no SQL Editor do banco do portal. Pode rodar de novo sem erro. Não mexe em grants de função.
-- ═══════════════════════════════════════════════════════════════

alter table preanalise_venda add column if not exists responsaveis             jsonb not null default '{}'::jsonb;  -- {gerente, assistente, corretor}
alter table preanalise_venda add column if not exists prazo_docs_banco_dias    integer;
alter table preanalise_venda add column if not exists prazo_retorno_banco_dias integer;

alter table preanalise_protocolo drop constraint if exists preanalise_protocolo_tipo_check;
alter table preanalise_protocolo add constraint preanalise_protocolo_tipo_check check (tipo in (
  'chaves', 'documentos', 'escritura', 'autorizacao', 'notificacao', 'recibo',
  'procuracao', 'atual_proprietario', 'chaves_proprietario', 'declaracao_uniao_estavel', 'declaracao_patrimonio',
  'direito_preferencia', 'proposta', 'exclusividade', 'corretagem', 'parceria_autonomo', 'parceria_pj'));

select 'ok — pré-análise: responsáveis, prazos do banco e novos tipos de documento' as status;
