-- ═══════════════════════════════════════════════════════════════
-- AVALIAÇÃO SOB DEMANDA — endereço → ponto → zona, do navegador. 13/09/2026.
--
-- A avaliação acontece ANTES do cadastro (é ela que precifica). O corretor
-- digita rua+número; o navegador geocodifica (nosso banco primeiro, OSM na
-- cauda), confirma o pino no mapa, e pega o zoneamento por RPC. Nenhum
-- segredo de banco sai daqui: tudo roda com o login do corretor.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists unaccent;

-- 1) GEOCODE local: casa o texto do endereço com nossa base já geocodificada
--    (aval_geo_ref = enderecos_zoneamento). Devolve candidatos; o corretor
--    confirma no mapa. Só endereço+coordenada — nada sensível.
create or replace function aval_geocode(p_q text)
returns table (endereco text, lat double precision, lng double precision, distrito text, origem text)
language plpgsql security definer set search_path = public as $$
declare
  q   text := upper(unaccent(coalesce(p_q,'')));
  toks text[];
begin
  q := regexp_replace(q, '[^A-Z0-9 ]', ' ', 'g');
  q := btrim(regexp_replace(q, '\s+', ' ', 'g'));
  if length(q) < 3 then return; end if;
  -- descarta palavras-tipo (RUA/AV/ALAMEDA...) — a base guarda abreviado (R/AV/AL)
  toks := array(
    select t from unnest(string_to_array(q, ' ')) t
     where length(t) >= 2
       and t not in ('RUA','AVENIDA','AV','ALAMEDA','AL','TRAVESSA','TV','PRACA','PCA',
                     'LARGO','ESTRADA','ESTR','VIADUTO','RODOVIA','VIA','MARGINAL','PARQUE'));
  if array_length(toks,1) is null then return; end if;
  return query
    select g.endereco, g.lat, g.lng, g.distrito, 'local'::text
      from aval_geo_ref g
     where g.endereco_norm ilike all (select '%'||t||'%' from unnest(toks) t)
     order by length(g.endereco_norm) asc
     limit 6;
end;
$$;
revoke all on function aval_geocode(text) from public;
grant execute on function aval_geocode(text) to authenticated;

-- 2) ZONA por ponto: point-in-polygon nas nossas camadas. Fonte única de
--    verdade do zoneamento (o geocode só dá o ponto).
create or replace function aval_geo(p_lat double precision, p_lng double precision)
returns table (zona text, ca_basico numeric, ca_maximo numeric, gabarito_m text,
               incorporavel boolean, familia text, distrito text)
language sql security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g)
  select zp.zona, zp.ca_basico, zp.ca_maximo, zp.gabarito_m, zp.incorporavel, zp.familia,
         (select d.nome from aval_distrito d, pt where st_contains(d.geom, pt.g) limit 1)
    from aval_zona z
    join aval_zona_param zp on zp.zona = z.zona, pt
   where st_contains(z.geom, pt.g)
   order by zp.ca_maximo desc nulls last
   limit 1;
$$;
revoke all on function aval_geo(double precision, double precision) from public;
grant execute on function aval_geo(double precision, double precision) to anon, authenticated;

-- 3) COMPARÁVEIS de fechamento (ITBI) por bairro — sem dono (ITBI não tem),
--    só o que interessa a um comparável. Complementa os anúncios ao vivo.
drop function if exists aval_comps_itbi(text, int);
create or replace function aval_comps_itbi(p_bairro text, p_lim int default 12)
returns table (logradouro text, numero text, valor numeric, area_constr numeric,
               rs_m2 numeric, data date, uso text)
language sql security definer set search_path = public as $$
  select logradouro, numero, valor, area_constr,
         round(valor/area_constr) as rs_m2, data, uso
    from aval_itbi_painel
   where bairro_norm = upper(unaccent(p_bairro))
     and natureza ilike '%compra%' and valor > 0 and area_constr > 0
     and (valor/area_constr) between 1500 and 40000        -- descarta lixo/terreno
   order by data desc nulls last
   limit greatest(p_lim, 1);
$$;
revoke all on function aval_comps_itbi(text, int) from public;
grant execute on function aval_comps_itbi(text, int) to authenticated;

-- 4) Deixa o corretor GRAVAR a avaliação sob demanda (fonte='ondemand').
--    Não pode tocar linhas da carteira (fonte='nido') — só criar as suas.
grant insert on aval_resultado to authenticated;
grant usage, select on sequence aval_resultado_id_seq to authenticated;
drop policy if exists aval_res_ins on aval_resultado;
create policy aval_res_ins on aval_resultado
  for insert to authenticated with check (fonte = 'ondemand');

select 'ok — geocode + zona + comps + insert sob demanda' as status;
