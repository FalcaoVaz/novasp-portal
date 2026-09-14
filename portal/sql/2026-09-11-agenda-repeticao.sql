-- Repeticao de eventos na agenda (estilo Google). 11/09/2026.
-- repete_grupo agrupa as ocorrencias de uma serie (pra excluir todas).
alter table agenda_eventos add column if not exists repete_grupo bigint;
create index if not exists idx_agenda_grupo on agenda_eventos (repete_grupo);
select 'ok' as status;
