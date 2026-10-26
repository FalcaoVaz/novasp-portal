-- ═══════════════════════════════════════════════════════════════
-- AVALIAÇÃO DE TERRENO: vendas reais de TERRENO por perto (26/10/2026, pedido do Rodrigo)
-- "Não pode usar apartamento de referência nem de casa nem de terreno": terreno compara com terreno.
-- Vendas registradas na Prefeitura (guias de ITBI de compra e venda, imóvel inteiro) com uso TERRENO, nos últimos 24 meses,
-- pelo raio em volta do ponto (600 m a 3 km, o menor que junta pelo menos 8). R$/m² = valor ÷ área do terreno.
-- Junto com os terrenos anunciados pela Nova SP (aval_anuncios_nsp_perto com p_grupo = 'terreno').
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
create or replace function aval_comps_itbi_terreno_raio(p_lat double precision, p_lng double precision, p_lim integer default 20)
returns table(logradouro text, numero text, valor numeric, area_terreno numeric, testada numeric, rs_m2 numeric, data date, uso text,
              lat double precision, lng double precision, dist_m integer, zona text)
language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g),
  v as (
    select i.logradouro, i.numero, i.valor, i.area_terreno, i.testada, round(i.valor / i.area_terreno) rs, i.data, i.uso,
           st_y(i.geom) lat, st_x(i.geom) lng, st_distance(i.geom::geography, pt.g::geography)::int d, i.zona
      from aval_itbi i, pt
     where i.geom && st_expand(pt.g, 0.03)
       and i.natureza like '1.%' and coalesce(i.proporcao, 100) >= 99
       and i.uso ~* 'TERRENO'
       and i.valor >= 50000 and i.area_terreno >= 60
       and (i.valor / i.area_terreno) between 300 and 40000
       and i.data >= current_date - interval '24 months'),
  v1 as (select * from (select v.*, row_number() over (partition by logradouro, numero order by data desc) k from v) x where k = 1),  -- 1 venda por lote
  r as (select min(raio) raio from (values (600), (1000), (1500), (2000), (3000)) x(raio)
         where (select count(*) from v1 where d <= x.raio) >= least(p_lim, 8))
  select logradouro, numero, valor, area_terreno, testada, rs, data, uso, lat, lng, d, zona
    from v1 where d <= coalesce((select raio from r), 3000)
   order by d, data desc
   limit greatest(least(p_lim, 40), 1);
$$;
revoke all on function aval_comps_itbi_terreno_raio(double precision, double precision, integer) from public, anon;
grant execute on function aval_comps_itbi_terreno_raio(double precision, double precision, integer) to authenticated;

select 'ok — aval_comps_itbi_terreno_raio' as status;
