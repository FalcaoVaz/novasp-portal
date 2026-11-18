-- 18/11/2026 — pacote da Renata (motor 1.3): "nada trava no jurídico".
-- liberacao_gerente: decisão do gerente sobre a VENDA INTEIRA {decisao: seguir|juridico, motivo, obs, por, em, status_no_momento}.
--   Qualquer uma das duas libera a venda; "juridico" é consulta (entra na fila de revisão, a venda segue).
-- liberacoes_anteriores: histórico das decisões mudadas ou desfeitas.
-- Pode rodar de novo sem erro. Não altera nenhuma venda existente.
alter table preanalise_venda add column if not exists liberacao_gerente jsonb;
alter table preanalise_venda add column if not exists liberacoes_anteriores jsonb not null default '[]'::jsonb;
select count(*) as vendas, count(liberacao_gerente) as com_decisao from preanalise_venda;
