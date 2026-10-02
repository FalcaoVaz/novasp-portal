-- ═══════════════════════════════════════════════════════════════
-- Lançamentos ANUNCIADOS (apto.vc, coletados por sandbox/coletar_apto.py): R$/m² privativo por planta.
-- Mediana por empreendimento e depois mediana entre empreendimentos num raio do ponto — cada prédio pesa igual.
-- Prioriza quem está em lançamento/na planta/em obras; "pronto para morar" só entra se faltar volume.
-- ═══════════════════════════════════════════════════════════════
create or replace function aval_lanc_anuncio(p_lat double precision, p_lng double precision, p_raio_m integer default 2000)
returns jsonb language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g),
  base as (
    select a.realty_id, a.nome, a.bairro, a.status, a.permalink, a.coletado_em, a.rs_m2,
           st_distance(a.geom::geography, pt.g::geography) d, (a.status ilike '%pronto%') pronto
      from aval_lanc_anuncio a, pt
     where a.geom && st_expand(pt.g, p_raio_m/100000.0) and st_dwithin(a.geom::geography, pt.g::geography, p_raio_m)),
  emp as (
    select realty_id, min(nome) nome, min(bairro) bairro, min(status) status, min(permalink) permalink, bool_and(pronto) pronto,
           round(min(d))::int d, count(*) plantas, percentile_cont(0.5) within group (order by rs_m2) rs, max(coletado_em) coletado_em
      from base group by realty_id),
  usar as (  -- sem os prontos se houver ao menos 3 em lançamento/obra
    select * from emp where not pronto or (select count(*) from emp where not pronto) < 3)
  select jsonb_build_object(
    'n', (select count(*) from usar),
    'rs_m2', (select round(percentile_cont(0.5) within group (order by rs))::int from usar),
    'q1', (select round(percentile_cont(0.25) within group (order by rs))::int from usar),
    'q3', (select round(percentile_cont(0.75) within group (order by rs))::int from usar),
    'raio_m', p_raio_m, 'coletado_em', (select to_char(max(coletado_em),'DD/MM/YYYY') from usar),
    'lista', coalesce((select jsonb_agg(jsonb_build_object('nome',nome,'bairro',bairro,'status',status,'rs',round(rs)::int,'d',d,'plantas',plantas,'url',permalink) order by d)
                         from (select * from usar order by d limit 10) x), '[]'::jsonb));
$$;
revoke all on function aval_lanc_anuncio(double precision,double precision,integer) from public, anon;
grant execute on function aval_lanc_anuncio(double precision,double precision,integer) to authenticated;
