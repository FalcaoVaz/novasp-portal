-- 18/11/2026 — mais de um advogado responsável por processo (Sistema Jurídico).
-- responsavel_id continua sendo o principal; corresponsaveis guarda os outros (ids de usuarios).
-- O processo entra na carteira de todos (filtro de advogado, relatório de andamentos, indicadores).
-- Pode rodar de novo sem erro. Não altera nenhum processo existente (todos começam sem corresponsáveis).
alter table processos add column if not exists corresponsaveis uuid[] not null default '{}';
create index if not exists processos_corresponsaveis on processos using gin (corresponsaveis);
select count(*) as processos, count(*) filter (where cardinality(corresponsaveis) > 0) as com_corresponsaveis from processos;
