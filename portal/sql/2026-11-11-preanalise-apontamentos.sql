-- Pré-análise: decisão do gerente sobre cada apontamento das certidões (pacote da Renata de 10/11/2026).
-- {id do apontamento: {decisao: seguir|juridico, motivo, obs, por, em, certidao, pessoa}}
alter table preanalise_venda add column if not exists decisoes_apontamentos jsonb not null default '{}'::jsonb;
select 'ok — pré-análise: decisões dos apontamentos' as status;
