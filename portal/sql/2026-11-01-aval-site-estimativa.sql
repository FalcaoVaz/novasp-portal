-- ═══════════════════════════════════════════════════════════════
-- ESTIMATIVA PÚBLICA do "Avalie seu imóvel" do site (01/11/2026, handoff da sessão do site)
-- Cada estimativa pedida pelo site fica registrada aqui (SEM dado pessoal: nome, celular e e-mail ficam só no Imoview;
-- o site põe o "ref" nas anotações do lead para o corretor abrir a avaliação completa no portal).
-- Grava só a função estimativa-publica (site do jurídico, service_role). O portal (equipe interna) lê.
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
create table if not exists aval_site_estimativa (
  ref          text primary key,                 -- est-AAAAMMDD-xxxxxx
  criado_em    timestamptz not null default now(),
  entrada      jsonb not null,                   -- tipo, rua, número, CEP, bairro, lat/lng, áreas, quartos, vagas (nada pessoal)
  ok           boolean not null,
  motivo       text,                             -- quando ok = false (poucos_dados, sem_endereco…)
  faixa_min    numeric,
  faixa_max    numeric,
  valor        numeric,                          -- valor central do núcleo (não vai para o cliente)
  confianca    text,                             -- alta | media | baixa
  regra        text,                             -- regra do núcleo usada (metodo_unico, casa_calibrada, terreno…)
  nucleo       text                              -- versão do nsp-avalia-core
);
create index if not exists aval_site_estimativa_data on aval_site_estimativa (criado_em desc);
alter table aval_site_estimativa enable row level security;
revoke all on aval_site_estimativa from anon, authenticated;
grant select on aval_site_estimativa to authenticated;
drop policy if exists equipe_le on aval_site_estimativa;
create policy equipe_le on aval_site_estimativa for select to authenticated using (not eh_corretor_site());

select 'ok — aval_site_estimativa' as status;
