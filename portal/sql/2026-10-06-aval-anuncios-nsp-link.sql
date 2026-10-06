-- ═══════════════════════════════════════════════════════════════
-- Anúncios da Nova SP com LINK para a ficha no site (Rodrigo, 06/10/2026): "os anúncios da novasp sobem com link
-- e os outros entram como referência". A carga (carregar_anuncios_nsp.py) só preenche o link quando a referência
-- está no sitemap do site (sitemap-properties.xml), para não levar a uma página de erro.
-- Rodar DEPOIS de 2026-10-06-aval-anuncios-nsp.sql e ANTES da carga com --gravar.
-- ═══════════════════════════════════════════════════════════════
alter table aval_anuncios_nsp add column if not exists url text;

drop function if exists aval_anuncios_nsp_perto(double precision, double precision, text, integer, integer);
create function aval_anuncios_nsp_perto(p_lat double precision, p_lng double precision, p_grupo text,
                                        p_lim integer default 12, p_raio_m integer default 2000)
returns table(ref text, tipo text, bairro text, rua text, area numeric, terreno numeric, valor numeric, rs_m2 integer,
              dorm integer, vaga integer, dist_m integer, url text, carregado_em timestamptz)
language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g)
  select a.ref, a.tipo, a.bairro, a.rua, a.area, a.terreno, a.valor, round(a.valor / a.area)::int,
         a.dorm, a.vaga, st_distance(a.geom::geography, pt.g::geography)::int, a.url, a.carregado_em
    from aval_anuncios_nsp a, pt
   where a.grupo = p_grupo
     and a.geom && st_expand(pt.g, 0.03)
     and st_dwithin(a.geom::geography, pt.g::geography, least(greatest(p_raio_m, 200), 5000))
     and a.area >= 15 and a.valor >= 50000
     and a.valor / a.area between 1500 and 80000
   order by a.geom <-> pt.g
   limit least(greatest(p_lim, 1), 30);
$$;
revoke all on function aval_anuncios_nsp_perto(double precision, double precision, text, integer, integer) from public, anon;
grant execute on function aval_anuncios_nsp_perto(double precision, double precision, text, integer, integer) to authenticated;

select 'ok — link dos anúncios da Nova SP' as status;
