-- 23/11/2026 — Cafés de parceria (Área do Parceiro do site) espelhados na Agenda do portal.
-- Quem marca/remarca/cancela é o SITE; a função falcaovaz cafes-sync lê o feed do site a cada 20 min e faz upsert aqui
-- (chave estável origem_id = id do café no site). Eventos com origem_id não são editáveis no portal (botão leva ao site).
-- Aparecem para os participantes (campo responsavel): gerente(s) da área, Rodrigo, Thais e Anderson (e o embaixador, se usar o portal).
alter table agenda_eventos add column if not exists origem_id text;
alter table agenda_eventos add column if not exists link text not null default '';
alter table agenda_eventos add column if not exists situacao text not null default '';   -- '' | 'cancelado'
create unique index if not exists agenda_eventos_origem on agenda_eventos (origem_id);
select count(*) as cafes from agenda_eventos where origem_id is not null;
