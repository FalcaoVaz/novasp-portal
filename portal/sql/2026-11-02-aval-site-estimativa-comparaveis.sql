-- ESTIMATIVA PÚBLICA — guarda a lista anonimizada de comparáveis e as contagens da base (02/11/2026, handoff do site)
-- Mesma lista que o proprietário vê na tela e no e-mail (rua sem número, distância, área, mês, valor arredondado). Sem dado pessoal.
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
alter table aval_site_estimativa add column if not exists comparaveis jsonb;
alter table aval_site_estimativa add column if not exists base jsonb;
select 'ok — comparaveis/base' as status;
