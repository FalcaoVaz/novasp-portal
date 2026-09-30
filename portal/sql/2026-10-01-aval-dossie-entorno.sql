-- ═══════════════════════════════════════════════════════════════
-- Dossiê em PDF + entorno do imóvel (01/10/2026)
-- • usuarios.creci: CRECI do corretor (preencher no cadastro; aparece no dossiê).
-- • aval_resultado: corretor_nome/corretor_creci, lat/lng do ponto, entorno (metrô/eixo/distrito) e
--   memoria (método único + conta de incorporação) gravados na hora do cálculo, para o PDF.
-- • aval_poi (estações de metrô/trem, GeoSampa) + aval_eixo (eixos de estruturação ativados) e a
--   RPC aval_entorno(lat,lng). Carga: sandbox/carregar_entorno.py.
-- • aval_por_token passa a devolver os campos novos (dossiê só de avaliação aprovada).
-- ═══════════════════════════════════════════════════════════════
alter table usuarios add column if not exists creci text;
alter table aval_resultado
  add column if not exists corretor_nome text,
  add column if not exists corretor_creci text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists entorno jsonb,
  add column if not exists memoria jsonb;

create table if not exists aval_poi (
  id integer primary key, tipo text not null, nome text, linha text, empresa text, situacao text, geom geometry(Point,4326)
);
create index if not exists idx_aval_poi_geom on aval_poi using gist (geom);
alter table aval_poi enable row level security; revoke all on aval_poi from anon, authenticated;
create table if not exists aval_eixo (
  id integer primary key, nome text, decreto text, geom geometry(Geometry,4326)
);
create index if not exists idx_aval_eixo_geom on aval_eixo using gist (geom);
alter table aval_eixo enable row level security; revoke all on aval_eixo from anon, authenticated;

create or replace function aval_entorno(p_lat double precision, p_lng double precision)
returns jsonb language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g),
  metro as (
    select jsonb_agg(jsonb_build_object('nome', q.nome, 'linha', q.linha, 'empresa', q.empresa, 'dist_m', q.d) order by q.d) j
      from (select * from (select distinct on (p.nome) p.nome, p.linha, p.empresa, st_distance(p.geom::geography, pt.g::geography)::integer d
                             from aval_poi p, pt where p.tipo='metro' and coalesce(p.situacao,'') not ilike '%desativ%' order by p.nome, d) u
             where u.d <= 3000 order by u.d limit 3) q),
  eixo as (select e.nome, e.decreto from aval_eixo e, pt where st_contains(e.geom, pt.g) limit 1),
  dist as (select d.nome from aval_distrito d, pt where st_contains(d.geom, pt.g) limit 1)
  select jsonb_build_object(
    'metro', coalesce((select j from metro), '[]'::jsonb),
    'eixo', (select nome from eixo), 'eixo_decreto', (select decreto from eixo),
    'distrito', (select nome from dist));
$$;
revoke all on function aval_entorno(double precision,double precision) from public, anon;
grant execute on function aval_entorno(double precision,double precision) to authenticated;

drop function if exists aval_por_token(text);
create or replace function aval_por_token(p_token text)
returns table(tipo text, bairro text, endereco text, edificio text, area_util numeric, terreno numeric, dorm smallint, suite smallint, vaga smallint,
              valor_mercado numeric, faixa_min numeric, faixa_max numeric, mercado_rs_m2 numeric, anuncios_usados integer, metodo text, zona text, ca numeric,
              incorp_aplicavel boolean, incorp_area_constr numeric, incorp_lancamento_rs_m2 numeric, incorp_vgv numeric, incorp_valor_terreno numeric, incorp_ganho_pct numeric,
              comparaveis jsonb, gerado_em timestamptz, corretor_nome text, corretor_creci text, lat double precision, lng double precision, entorno jsonb, memoria jsonb,
              aprovado_em timestamptz, preco_pedido numeric)
language sql security definer set search_path = public as $$
  select tipo,bairro,endereco,edificio,area_util,terreno,dorm,suite,vaga,
         valor_mercado,faixa_min,faixa_max,mercado_rs_m2,anuncios_usados,metodo,
         zona,ca,incorp_aplicavel,incorp_area_constr,incorp_lancamento_rs_m2,
         incorp_vgv,incorp_valor_terreno,incorp_ganho_pct,comparaveis,gerado_em,
         corretor_nome,corretor_creci,lat,lng,entorno,memoria,aprovado_em,preco_pedido
    from aval_resultado
   where token = p_token and status = 'aprovada'   -- só dossiê já revisado vaza pro dono
   limit 1;
$$;
grant execute on function aval_por_token(text) to anon, authenticated;
select 'ok — dossiê/entorno' as status;
