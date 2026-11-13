-- 13/11/2026 — HOME OFFICE nas agendas (portal e jurídico).
-- Cada pessoa marca o próprio dia de home office:
--   tipo 'dia'      → só naquela data
--   tipo 'semanal'  → toda semana naquele dia da semana (dia_semana 1=seg … 5=sex), a partir de "data"
--   tipo 'excecao'  → tira o semanal só naquela data (ex.: vem ao escritório nesta sexta)
-- Leitura: qualquer usuário logado do portal (menos corretor do site). Gravar/apagar: só a própria pessoa (e-mail do login) ou admin.
create table if not exists agenda_home_office (
  id          bigint generated always as identity primary key,
  email       text not null,
  nome        text not null,
  tipo        text not null check (tipo in ('dia','semanal','excecao')),
  data        date not null,
  dia_semana  smallint check (dia_semana between 1 and 5),
  criado_em   timestamptz not null default now(),
  check (tipo <> 'semanal' or dia_semana is not null)
);
create index if not exists agenda_home_office_data on agenda_home_office (data);
alter table agenda_home_office enable row level security;

drop policy if exists "home office: ler" on agenda_home_office;
create policy "home office: ler" on agenda_home_office for select to authenticated using (not eh_corretor_site());

drop policy if exists "home office: o próprio" on agenda_home_office;
create policy "home office: o próprio" on agenda_home_office for all to authenticated
  using (lower(email) = lower(coalesce(auth.jwt()->>'email','')) or exists (select 1 from usuarios u where u.admin and lower(u.email) = lower(coalesce(auth.jwt()->>'email',''))))
  with check (lower(email) = lower(coalesce(auth.jwt()->>'email','')) or exists (select 1 from usuarios u where u.admin and lower(u.email) = lower(coalesce(auth.jwt()->>'email',''))));

grant select, insert, delete on agenda_home_office to authenticated;

select count(*) as registros from agenda_home_office;
