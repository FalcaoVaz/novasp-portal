-- ═══════════════════════════════════════════════════════════════
-- aval_geo: ponto na rua (fora de qualquer perímetro de zona) passa a usar a zona mais próxima até 60 m.
-- Motivo: as vias não pertencem a zona nenhuma no GeoSampa; o geocodificador costuma pôr o pino no eixo da rua,
-- e a avaliação dizia "fora da área com zoneamento carregado" (Rua Biobedas, 01/10/2026).
-- Prioridade: zona que CONTÉM o ponto; senão a mais próxima (ignorando Praça/Canteiro), com distância devolvida.
-- 2ª versão (mesmo dia): st_dwithin em geography ignorava o índice e varria 38 mil perímetros — estourava o statement_timeout da API (8 s)
-- para o usuário autenticado (Rua Guamiuma, 124). Agora o pré-filtro usa a geometria indexada (&& st_expand).
-- ═══════════════════════════════════════════════════════════════
drop function if exists aval_geo(double precision, double precision);
create or replace function aval_geo(p_lat double precision, p_lng double precision)
returns table(zona text, ca_basico numeric, ca_maximo numeric, gabarito_m text, incorporavel boolean, familia text, distrito text, dist_m integer)
language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g),
  cand as (
    -- pré-filtro pelo índice GiST em GEOMETRIA (caixa de ~70 m em graus); a distância exata vem da geografia só nos candidatos
    select z.zona, st_distance(z.geom::geography, pt.g::geography) d, st_contains(z.geom, pt.g) dentro
      from aval_zona z, pt
     where z.geom && st_expand(pt.g, 0.0007)
       and z.zona not in ('Praça/Canteiro')
  )
  select zp.zona, zp.ca_basico, zp.ca_maximo, zp.gabarito_m, zp.incorporavel, zp.familia,
         (select d.nome from aval_distrito d, pt where st_contains(d.geom, pt.g) limit 1),
         c.d::integer
    from cand c join aval_zona_param zp on zp.zona = c.zona
   where c.d <= 60
   order by c.dentro desc, c.d asc, zp.ca_maximo desc nulls last
   limit 1;
$$;
revoke all on function aval_geo(double precision,double precision) from public, anon;
grant execute on function aval_geo(double precision,double precision) to authenticated;
