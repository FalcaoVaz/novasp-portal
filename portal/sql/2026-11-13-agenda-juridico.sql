-- 13/11/2026 — Agenda do jurídico separada da agenda da NSP (mesma tabela, campo "agenda").
--   'nsp'      = agenda do portal (todos os compromissos que já existem ficam aqui)
--   'juridico' = agenda do Sistema Jurídico (falcaovaz.netlify.app → Agenda)
-- Regras de exibição (no código): cada agenda mostra só os seus compromissos; o Rodrigo vê as duas juntas;
-- compromisso "Pessoal" aparece para os demais como "Ocupado" (sem título nem descrição).
-- Pode rodar de novo sem erro. Não altera nenhum compromisso existente além de marcar a agenda 'nsp'.
alter table agenda_eventos add column if not exists agenda text not null default 'nsp';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agenda_eventos_agenda_chk') then
    alter table agenda_eventos add constraint agenda_eventos_agenda_chk check (agenda in ('nsp','juridico'));
  end if;
end $$;
create index if not exists agenda_eventos_agenda_data on agenda_eventos (agenda, data);

select agenda, count(*) from agenda_eventos group by 1;
