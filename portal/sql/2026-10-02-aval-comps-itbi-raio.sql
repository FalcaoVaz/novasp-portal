-- ═══════════════════════════════════════════════════════════════
-- Vendas reais (ITBI) comparáveis pelo RAIO em volta do imóvel, não pelo nome do bairro
-- (o bairro detectado pelo mapa — ex.: "São Judas" — não bate com o bairro do ITBI). Últimos 18 meses,
-- mesmo tipo (apto/casa), mais perto primeiro; amplia o raio se vier pouco.
-- ═══════════════════════════════════════════════════════════════
create or replace function aval_comps_itbi_raio(p_lat double precision, p_lng double precision, p_tipo text default 'apto', p_lim integer default 20)
returns table(logradouro text, numero text, valor numeric, area_constr numeric, rs_m2 numeric, data date, uso text, lat double precision, lng double precision, dist_m integer, acc smallint)
language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g),
  v as (
    select i.logradouro, i.numero, i.valor, i.area_constr, round(i.valor/i.area_constr) rs, i.data, i.uso,
           st_y(i.geom) lat, st_x(i.geom) lng, st_distance(i.geom::geography, pt.g::geography)::int d, i.acc
      from aval_itbi i, pt
     where i.geom && st_expand(pt.g, 0.02)
       and i.natureza like '1.%' and coalesce(i.proporcao,100) >= 99
       and i.valor > 0 and i.area_constr > 0 and (i.valor/i.area_constr) between 1500 and 40000
       and i.data >= current_date - interval '18 months'
       and i.uso !~* 'GARAGEM|VAGA|DEP[OÓ]SITO'      -- vaga avulsa e depósito não são imóvel comparável
       and case when p_tipo='casa' then i.uso ~* '(RESID|CASA|SOBRADO)' and i.uso !~* 'APART|CONDOM'
                else i.uso ~* 'APART' end),
  v5 as (select * from (select v.*, row_number() over (partition by logradouro, numero order by data desc) k from v) x where k <= 5),  -- até 5 vendas por prédio
  r as (select min(raio) raio from (values (600),(1000),(1500),(2000)) x(raio)
         where (select count(*) from v5 where d <= x.raio) >= least(p_lim, 12))
  select logradouro, numero, valor, area_constr, rs, data, uso, lat, lng, d, acc
    from v5 where d <= coalesce((select raio from r), 2000)
   order by d, data desc
   limit greatest(least(p_lim,40),1);
$$;
revoke all on function aval_comps_itbi_raio(double precision,double precision,text,integer) from public, anon;
grant execute on function aval_comps_itbi_raio(double precision,double precision,text,integer) to authenticated;
