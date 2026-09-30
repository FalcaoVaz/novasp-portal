-- Fator de planejamento (Fp) residencial — Quadro 6 do PDE (GeoSampa, camada
-- "Fator de planejamento - Residencial", 01/10/2026). Polígonos por macroárea; na
-- Macroárea de Estruturação Metropolitana, por setor/subsetor. Valores: MUC 0,7 · MQU 0,6 ·
-- MCQUA 1,0 · MRVRA 1,0 · MRVU 0,3 · MEM: Arco Jurubatuba/Tamanduateí/Pinheiros/Tietê/Central 1,2,
-- Eixos (Cupecê, Fernão Dias, Noroeste, Jacu-Pêssego) 0,3, Arco Leste 0,3, Faria Lima/Chucri Zaidan n/a.
-- Carga: sandbox/carregar_fp.py (macroareas.geojson + fp_mem_nsp_20261001.json, EPSG:31983→4326).
create table if not exists aval_fp (
  id integer primary key, sg_macroarea text, macroarea text, setor text, subsetor text,
  fp_texto text, fp numeric(6,3), geom geometry(Geometry,4326)
);
create index if not exists idx_aval_fp_geom on aval_fp using gist (geom);
alter table aval_fp enable row level security;
revoke all on aval_fp from anon, authenticated;
create or replace function aval_fp(p_lat double precision, p_lng double precision)
returns table(fp numeric, fp_texto text, macroarea text, setor text, subsetor text)
language sql stable security definer set search_path = public as $$
  select f.fp, f.fp_texto, f.macroarea, f.setor, f.subsetor from aval_fp f
   where st_contains(f.geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326))
   order by (f.setor is not null) desc, f.fp desc nulls last limit 1;   -- setor da MEM vence a macroárea genérica
$$;
revoke all on function aval_fp(double precision,double precision) from public, anon;
grant execute on function aval_fp(double precision,double precision) to authenticated;
select 'ok — aval_fp' as status;
