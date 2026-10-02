-- ═══════════════════════════════════════════════════════════════
-- Preço de lançamento REALIZADO: vendas registradas no ITBI de apartamentos novos (construídos nos últimos 4 anos)
-- num raio em volta do ponto. Os portais não publicam preço de lançamento de forma acessível (Lopes não mostra; VivaReal/Imovelweb bloqueiam).
-- R$/m² do ITBI é por área do CADASTRO; o portal converte para área útil (× 1,69, razão medida no Foca para prédios 2019+).
-- ═══════════════════════════════════════════════════════════════
create index if not exists idx_aval_itbi_geom on aval_itbi using gist (geom);
create index if not exists idx_aval_itbi_acc on aval_itbi (acc);

create or replace function aval_lanc_itbi(p_lat double precision, p_lng double precision, p_raio_m integer default 1500)
returns jsonb language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g),
  v as (
    select i.logradouro, i.numero, i.acc, i.valor, i.area_constr, i.valor/i.area_constr rs, i.data,
           st_distance(i.geom::geography, pt.g::geography) d
      from aval_itbi i, pt
     where i.geom && st_expand(pt.g, p_raio_m/100000.0)
       and st_dwithin(i.geom::geography, pt.g::geography, p_raio_m)
       and i.uso ilike '%apart%' and i.natureza like '1.%' and coalesce(i.proporcao,100) >= 99
       and i.acc >= extract(year from current_date)::int - 4
       and i.area_constr between 20 and 600 and i.valor between 150000 and 15000000
  ),
  q as (select percentile_cont(0.25) within group (order by rs) q1, percentile_cont(0.75) within group (order by rs) q3 from v),
  f as (select v.* from v, q where v.rs between q.q1 - 1.5*(q.q3-q.q1) and q.q3 + 1.5*(q.q3-q.q1)),
  pred as (
    select logradouro, numero, min(acc) acc, count(*) n, round(percentile_cont(0.5) within group (order by rs))::int rs, round(min(d))::int d
      from f group by 1,2 order by count(*) desc limit 8)
  select jsonb_build_object(
    'n', (select count(*) from f),
    'predios', (select count(distinct (logradouro, numero)) from f),
    'rs_m2_cadastro', (select round(percentile_cont(0.5) within group (order by rs))::int from f),
    'raio_m', p_raio_m,
    'periodo', (select to_char(min(data),'MM/YYYY')||'–'||to_char(max(data),'MM/YYYY') from f),
    'lista', coalesce((select jsonb_agg(to_jsonb(pred)) from pred), '[]'::jsonb));
$$;
revoke all on function aval_lanc_itbi(double precision,double precision,integer) from public, anon;
grant execute on function aval_lanc_itbi(double precision,double precision,integer) to authenticated;
