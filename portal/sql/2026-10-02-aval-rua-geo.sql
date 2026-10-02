-- ═══════════════════════════════════════════════════════════════
-- Localizador de ruas (e de endereço com número) a partir das vendas do ITBI já geolocalizadas (Zona Sul).
-- Serve para: pôr no mapa os anúncios que só trazem a rua (QuintoAndar) e localizar o imóvel quando
-- a base local e o OpenStreetMap não acham o endereço digitado.
-- ═══════════════════════════════════════════════════════════════
create or replace function aval_norm_rua(t text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(upper(public.unaccent('public.unaccent'::regdictionary, coalesce(t,''))),
         '^(RUA|R|AVENIDA|AV|ALAMEDA|AL|TRAVESSA|TV|PRACA|PC|PCA|ESTRADA|ESTR|VIELA|VL|LARGO|LGO|PASSAGEM|PSG|DOUTOR|DR|PROFESSOR|PROF)\.?\s+', ''), '\s+', ' ', 'g'))
$$;
drop table if exists aval_rua_geo;
create table aval_rua_geo as
  select aval_norm_rua(logradouro) rua_norm, ltrim(trim(numero),'0') numero,
         percentile_cont(0.5) within group (order by st_y(geom)) lat,
         percentile_cont(0.5) within group (order by st_x(geom)) lng, count(*) n
    from aval_itbi where geom is not null and logradouro is not null
   group by 1, 2;
create index on aval_rua_geo (rua_norm, numero);
create index aval_rua_geo_trgm on aval_rua_geo using gin (rua_norm gin_trgm_ops);
alter table aval_rua_geo enable row level security; revoke all on aval_rua_geo from anon, authenticated;

-- Várias ruas de uma vez (anúncios): devolve o centro aproximado de cada rua (mediana dos prédios com venda registrada).
create or replace function aval_geocode_ruas(p_ruas text[])
returns table(rua text, lat double precision, lng double precision, predios bigint)
language sql stable security definer set search_path = public as $$
  with q as (select distinct r rua, aval_norm_rua(r) n from unnest(p_ruas) r where coalesce(r,'')<>''),
  best as (
    select q.rua, (select g.rua_norm from aval_rua_geo g where g.rua_norm % q.n order by similarity(g.rua_norm, q.n) desc limit 1) rn
      from q)
  select b.rua, percentile_cont(0.5) within group (order by g.lat), percentile_cont(0.5) within group (order by g.lng), count(*)
    from best b join aval_rua_geo g on g.rua_norm = b.rn
   where similarity(b.rn, aval_norm_rua(b.rua)) >= 0.6
   group by b.rua;
$$;
-- Um endereço: número exato, senão o número mais próximo da mesma rua, senão o centro da rua.
create or replace function aval_geocode_endereco(p_rua text, p_numero text)
returns table(lat double precision, lng double precision, precisao text, rua_norm text)
language sql stable security definer set search_path = public as $$
  with a as (select aval_norm_rua(p_rua) n, nullif(regexp_replace(coalesce(p_numero,''),'\D','','g'),'')::int num),
  r as (select g.rua_norm from aval_rua_geo g, a where g.rua_norm % a.n group by 1 order by max(similarity(g.rua_norm, a.n)) desc limit 1),
  cand as (
    select g.lat, g.lng, g.rua_norm,
           abs(nullif(regexp_replace(g.numero,'\D','','g'),'')::int - a.num) dif
      from aval_rua_geo g, r, a where g.rua_norm = r.rua_norm and nullif(regexp_replace(g.numero,'\D','','g'),'') is not null)
  (select lat, lng, case when dif=0 then 'número exato' else 'número próximo ('||dif||')' end, rua_norm from cand where dif <= 60 order by dif limit 1)
  union all
  (select percentile_cont(0.5) within group (order by lat), percentile_cont(0.5) within group (order by lng), 'centro da rua', min(rua_norm)
     from cand where not exists (select 1 from cand where dif <= 60) having count(*) > 0)
  limit 1;
$$;
revoke all on function aval_geocode_ruas(text[]) from public, anon;
revoke all on function aval_geocode_endereco(text, text) from public, anon;
grant execute on function aval_geocode_ruas(text[]) to authenticated;
grant execute on function aval_geocode_endereco(text, text) to authenticated;
