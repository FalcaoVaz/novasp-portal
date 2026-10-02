-- ═══════════════════════════════════════════════════════════════
-- Anúncio só com a rua: em vez do centro da rua (ruim em avenidas longas), usa o TRECHO da rua mais perto do imóvel
-- avaliado — a busca de anúncios é do mesmo bairro. Mediana dos prédios da rua a até 1,2 km do ponto; sem nenhum,
-- o prédio da rua mais perto (até 3 km). Fora disso, o anúncio não entra no mapa.
-- Localização do imóvel: sem o número (±60) na base, NÃO devolve centro da rua (passa para o OpenStreetMap).
-- ═══════════════════════════════════════════════════════════════
drop function if exists aval_geocode_ruas(text[]);
create or replace function aval_geocode_ruas(p_ruas text[], p_lat double precision default null, p_lng double precision default null)
returns table(rua text, lat double precision, lng double precision, predios bigint, dist_m integer)
language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography g),
  q as (select distinct r rua, aval_norm_rua(r) n from unnest(p_ruas) r where coalesce(r,'')<>''),
  best as (
    select q.rua, (select g.rua_norm from aval_rua_geo g where g.rua_norm % q.n order by similarity(g.rua_norm, q.n) desc limit 1) rn, q.n
      from q),
  pts as (
    select b.rua, g.lat, g.lng,
           case when p_lat is null then 0 else st_distance(st_setsrid(st_makepoint(g.lng, g.lat),4326)::geography, (select g from pt)) end d
      from best b join aval_rua_geo g on g.rua_norm = b.rn
     where similarity(b.rn, b.n) >= 0.6),
  perto as (select rua, percentile_cont(0.5) within group (order by lat) lat, percentile_cont(0.5) within group (order by lng) lng, count(*) n, min(d) d
              from pts where d <= 1200 group by rua),
  mais_perto as (select distinct on (rua) rua, lat, lng, 1::bigint n, d from pts where d <= 3000 and rua not in (select rua from perto) order by rua, d)
  select rua, lat, lng, n, round(d)::int from perto
  union all
  select rua, lat, lng, n, round(d)::int from mais_perto;
$$;
create or replace function aval_geocode_endereco(p_rua text, p_numero text)
returns table(lat double precision, lng double precision, precisao text, rua_norm text)
language sql stable security definer set search_path = public as $$
  with a as (select aval_norm_rua(p_rua) n, nullif(regexp_replace(coalesce(p_numero,''),'\D','','g'),'')::int num),
  r as (select g.rua_norm from aval_rua_geo g, a where g.rua_norm % a.n group by 1 order by max(similarity(g.rua_norm, a.n)) desc limit 1),
  cand as (
    select g.lat, g.lng, g.rua_norm, abs(nullif(regexp_replace(g.numero,'\D','','g'),'')::int - a.num) dif
      from aval_rua_geo g, r, a where g.rua_norm = r.rua_norm and nullif(regexp_replace(g.numero,'\D','','g'),'') is not null)
  select lat, lng, case when dif=0 then 'número exato' else 'número próximo ('||dif||')' end, rua_norm
    from cand where dif <= 60 order by dif limit 1;
$$;
revoke all on function aval_geocode_ruas(text[], double precision, double precision) from public, anon;
grant execute on function aval_geocode_ruas(text[], double precision, double precision) to authenticated;
