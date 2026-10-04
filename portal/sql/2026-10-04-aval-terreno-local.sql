-- ═══════════════════════════════════════════════════════════════
-- Preço LOCAL do terreno para a avaliação de CASA por terreno + construção (04/10/2026).
-- Calibrado em 10.585 vendas de casas do ITBI (24 meses, Zona Sul e entorno), validação deixando cada venda de fora:
--   valor = terreno × L × (terreno/154)^-0,5  +  construída × 3.500 × fator do padrão × max(0,5; 1 − idade/100)
--   erro absoluto mediano 23%, viés 0% (o comparativo por R$/m² construído dá 26%; a conta antiga ~50% abaixo).
-- L = mediana, nas 30 vendas de casa mais próximas, do terreno implícito de cada venda
--     (valor × 1,035 − construção depreciada) / (terreno × (terreno/154)^-0,5).
-- Fator do padrão (IPTU): A 0,65 · B 0,8 · C 1 · D 1,25 · E 1,55 · F 1,9. Idade desconhecida = 50 anos (mediana).
-- ═══════════════════════════════════════════════════════════════
create or replace function aval_terreno_local(p_lat double precision, p_lng double precision, p_k integer default 30)
returns table(rs_terreno_ref numeric, lote_ref integer, n integer, raio_m integer, rs_terreno_p25 numeric, rs_terreno_p75 numeric)
language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g),
  v as (
    select i.valor * 1.035 v, i.area_terreno t, i.area_constr c,
           case i.padrao when 10 then 0.65 when 11 then 0.8 when 12 then 1 when 13 then 1.25 when 14 then 1.55 when 15 then 1.9 else 1 end kp,
           case when i.acc > 1800 then 2026 - i.acc else 50 end idade,
           st_distance(i.geom::geography, pt.g::geography)::int d
      from aval_itbi i, pt
     where i.geom && st_expand(pt.g, 0.03)
       and i.natureza like '1.%' and coalesce(i.proporcao, 100) >= 99 and i.valor > 50000
       and i.data >= current_date - interval '24 months'
       and i.uso ~* '^RESID' and i.uso !~* 'APART|CONDOM|COLETIV'
       and i.area_terreno between 40 and 2000 and i.area_constr between 30 and 1500
       and i.valor / i.area_constr between 800 and 30000
     order by i.geom <-> pt.g
     limit greatest(least(p_k, 80), 10)),
  l as (select (v - c * 3500 * kp * greatest(0.5, 1 - idade / 100.0)) / (t * power(t / 154.0, -0.5)) lt, d from v)
  select round(percentile_cont(0.5) within group (order by lt)::numeric), 154, count(*)::int, max(d),
         round(percentile_cont(0.25) within group (order by lt)::numeric), round(percentile_cont(0.75) within group (order by lt)::numeric)
    from l;
$$;
revoke all on function aval_terreno_local(double precision, double precision, integer) from public, anon;
grant execute on function aval_terreno_local(double precision, double precision, integer) to authenticated;
