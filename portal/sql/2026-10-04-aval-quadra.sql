-- ═══════════════════════════════════════════════════════════════
-- Centro das QUADRAS FISCAIS (GeoSampa, camada lote_cidadao, 04/10/2026) — 46.949 quadras da cidade.
-- Uso: pôr o pino do imóvel pela quadra do cadastro do IPTU (setor + quadra do SQL), em vez de confiar no nome
-- da rua. Caso que motivou: "Rua Manoel Correia Júnior, 86" ia para a "R. Correia Júnior", a 3 km, porque a rua
-- certa não tem venda registrada no ITBI e a busca escolhia o nome mais parecido.
-- Carga: sandbox/carregar_quadras.py (lê ~/Downloads/foca/dados/geosampa/quadras_centro_cidade_20261004.csv).
-- ═══════════════════════════════════════════════════════════════
create table if not exists aval_quadra (
  setor text not null, quadra text not null, lat double precision not null, lng double precision not null, distrito text,
  primary key (setor, quadra));
alter table aval_quadra enable row level security;
revoke all on aval_quadra from anon, authenticated;

-- SQL do contribuinte em qualquer formato ("047.278.0208-2", "0472780208-2", 4727802082) → centro da quadra
create or replace function aval_quadra_ponto(p_sql text)
returns table(setor text, quadra text, lat double precision, lng double precision, distrito text)
language sql stable security definer set search_path = public as $$
  with s as (select lpad(regexp_replace(coalesce(p_sql,''), '\D', '', 'g'), 11, '0') d)
  select q.setor, q.quadra, q.lat, q.lng, q.distrito
    from aval_quadra q, s
   where length(regexp_replace(coalesce(p_sql,''), '\D', '', 'g')) >= 6
     and q.setor = substr(s.d, 1, 3) and q.quadra = substr(s.d, 4, 3);
$$;
revoke all on function aval_quadra_ponto(text) from public, anon;
grant execute on function aval_quadra_ponto(text) to authenticated;
