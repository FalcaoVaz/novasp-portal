-- ═══════════════════════════════════════════════════════════════
-- Achados do mercado local para o texto do parecer (o que a tela NÃO mostra):
-- R$/m² útil estimado das vendas reais de apartamento num raio, por idade do prédio, por tamanho, por andar (lido do
-- complemento "AP 52" = 5º andar), tendência por semestre, vendas no mesmo prédio e na mesma rua.
-- Área útil estimada = (cadastro − 29) ÷ 1,35, a mesma conversão da tela.
-- ═══════════════════════════════════════════════════════════════
create or replace function aval_fatos(p_lat double precision, p_lng double precision, p_logradouro text default null, p_numero text default null, p_raio_m integer default 800)
returns jsonb language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g),
  v as (
    select i.logradouro, i.numero, i.complemento, i.data, i.valor, i.acc, i.padrao_desc,
           greatest(20, (i.area_constr - 29) / 1.35) util,
           i.valor / greatest(20, (i.area_constr - 29) / 1.35) rs,
           nullif(substring(i.complemento from 'AP\w*\s*(\d{2,4})'), '') ap
      from aval_itbi i, pt
     where i.geom && st_expand(pt.g, p_raio_m/100000.0) and st_dwithin(i.geom::geography, pt.g::geography, p_raio_m)
       and i.uso ~* 'APART' and i.uso !~* 'GARAGEM|VAGA|DEP[OÓ]SITO' and i.natureza like '1.%'
       and coalesce(i.proporcao,100) >= 99 and i.area_constr between 25 and 600 and i.valor between 100000 and 20000000),
  vf as (select v.*, case when ap is not null and length(ap) >= 2 then left(ap, length(ap)-1)::int end andar from v),
  q as (select percentile_cont(0.02) within group (order by rs) lo, percentile_cont(0.98) within group (order by rs) hi from vf),
  w as (select vf.* from vf, q where rs between q.lo and q.hi),
  med as (select round(percentile_cont(0.5) within group (order by rs))::int m from w)
  select jsonb_build_object(
    'raio_m', p_raio_m, 'periodo', (select to_char(min(data),'MM/YYYY')||' a '||to_char(max(data),'MM/YYYY') from w),
    'vendas_apto', (select count(*) from w), 'rs_m2_util_mediana', (select m from med),
    'por_idade_do_predio', (select jsonb_agg(jsonb_build_object('faixa', f, 'vendas', n, 'rs_m2_util', r) order by o) from (
        select case when acc < 1980 then 'antes de 1980' when acc < 2000 then '1980 a 1999' when acc < 2015 then '2000 a 2014' else '2015 em diante' end f,
               min(case when acc < 1980 then 1 when acc < 2000 then 2 when acc < 2015 then 3 else 4 end) o, count(*) n,
               round(percentile_cont(0.5) within group (order by rs))::int r
          from w where acc > 1900 group by 1 having count(*) >= 8) x),
    'por_tamanho_util', (select jsonb_agg(jsonb_build_object('faixa', f, 'vendas', n, 'rs_m2_util', r) order by o) from (
        select case when util < 40 then 'até 40 m²' when util < 60 then '40 a 60 m²' when util < 90 then '60 a 90 m²' when util < 130 then '90 a 130 m²' else 'acima de 130 m²' end f,
               min(case when util < 40 then 1 when util < 60 then 2 when util < 90 then 3 when util < 130 then 4 else 5 end) o, count(*) n,
               round(percentile_cont(0.5) within group (order by rs))::int r
          from w group by 1 having count(*) >= 8) x),
    'por_andar', (select jsonb_agg(jsonb_build_object('faixa', f, 'vendas', n, 'rs_m2_util', r) order by o) from (
        select case when andar <= 3 then '1º ao 3º' when andar <= 9 then '4º ao 9º' else '10º em diante' end f,
               min(case when andar <= 3 then 1 when andar <= 9 then 2 else 3 end) o, count(*) n,
               round(percentile_cont(0.5) within group (order by rs))::int r
          from w where andar between 1 and 40 group by 1 having count(*) >= 8) x),
    'por_semestre', (select jsonb_agg(jsonb_build_object('semestre', s, 'vendas', n, 'rs_m2_util', r) order by s) from (
        select extract(year from data)::int || '-' || case when extract(month from data) <= 6 then '1' else '2' end s, count(*) n,
               round(percentile_cont(0.5) within group (order by rs))::int r
          from w group by 1 having count(*) >= 8) x),
    'mesmo_predio', (select jsonb_agg(jsonb_build_object('data', data, 'unidade', complemento, 'area_util_est', round(util), 'valor', valor, 'rs_m2_util', round(rs), 'ano_predio', acc) order by data)
        from vf where p_logradouro is not null and aval_norm_rua(logradouro) = aval_norm_rua(p_logradouro) and ltrim(numero,'0') = ltrim(coalesce(p_numero,''),'0')),
    'mesma_rua', (select jsonb_build_object('vendas', count(*), 'rs_m2_util', round(percentile_cont(0.5) within group (order by rs))::int)
        from w where p_logradouro is not null and aval_norm_rua(logradouro) = aval_norm_rua(p_logradouro)));
$$;
revoke all on function aval_fatos(double precision,double precision,text,text,integer) from public, anon;
grant execute on function aval_fatos(double precision,double precision,text,text,integer) to authenticated;
