-- ═══════════════════════════════════════════════════════════════
-- Avaliação: entorno completo (01/10/2026)
-- aval_poi recebe os pontos de interesse da base de vizinhança do site (GeoSampa + OSM: ônibus, ciclovia, parque,
-- escola, feira, clube, hospital) — carga: sandbox/carregar_pois.py. aval_entorno passa a devolver, por categoria,
-- o mais próximo (nome + distância em linha reta) e quantos há a 500 m / 1 km.
-- ═══════════════════════════════════════════════════════════════
create index if not exists idx_aval_poi_tipo on aval_poi (tipo);

create or replace function aval_entorno(p_lat double precision, p_lng double precision)
returns jsonb language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography gg),
  metro as (
    select jsonb_agg(jsonb_build_object('nome', q.nome, 'linha', q.linha, 'empresa', q.empresa, 'dist_m', q.d) order by q.d) j
      from (select * from (select distinct on (p.nome) p.nome, p.linha, p.empresa, st_distance(p.geom::geography, pt.gg)::integer d
                             from aval_poi p, pt where p.tipo='metro' and coalesce(p.situacao,'') not ilike '%desativ%' order by p.nome, d) u
             where u.d <= 3000 order by u.d limit 3) q),
  -- candidatos num raio de 1,5 km (índice gist); parques e ciclovias são vértices da borda → distinct on (nome) pega o ponto mais perto
  cand as (
    select p.tipo, p.nome, st_distance(p.geom::geography, pt.gg)::integer d
      from aval_poi p, pt
     where p.tipo <> 'metro' and st_dwithin(p.geom::geography, pt.gg, 1500)
  ),
  nomes as (select distinct on (tipo, nome) tipo, nome, d from cand order by tipo, nome, d),
  top as (
    select tipo, jsonb_agg(jsonb_build_object('nome', nome, 'dist_m', d) order by d) j
      from (select tipo, nome, d, row_number() over (partition by tipo order by d) rn from nomes) t
     where rn <= 3 group by tipo
  ),
  n500 as (select tipo, count(*) n from nomes where d <= 500 group by tipo),
  n1000 as (select tipo, count(*) n from nomes where d <= 1000 group by tipo),
  eixo as (select e.nome, e.decreto from aval_eixo e, pt where st_contains(e.geom, pt.g) limit 1),
  dist as (select d.nome from aval_distrito d, pt where st_contains(d.geom, pt.g) limit 1)
  select jsonb_build_object(
    'metro', coalesce((select j from metro), '[]'::jsonb),
    'pois', coalesce((select jsonb_object_agg(tipo, j) from top), '{}'::jsonb),
    'n500', coalesce((select jsonb_object_agg(tipo, n) from n500), '{}'::jsonb),
    'n1000', coalesce((select jsonb_object_agg(tipo, n) from n1000), '{}'::jsonb),
    'eixo', (select nome from eixo), 'eixo_decreto', (select decreto from eixo),
    'distrito', (select nome from dist));
$$;
revoke all on function aval_entorno(double precision,double precision) from public, anon;
grant execute on function aval_entorno(double precision,double precision) to authenticated;
