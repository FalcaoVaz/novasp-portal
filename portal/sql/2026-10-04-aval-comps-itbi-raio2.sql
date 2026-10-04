-- ⚠ TESTADA E NÃO ADOTADA (04/10/2026): no teste com 30 apartamentos vendidos pela NSP, ponderar por prédio/tamanho
-- piorou o erro mediano (16% → 20%). Função removida do banco; arquivo guardado só como registro.
-- ═══════════════════════════════════════════════════════════════
-- Vendas reais (ITBI) comparáveis — versão 2 (04/10/2026). A versão 1 continua no ar (portal v81 usa a 1).
-- Mudanças medidas no teste contra pareceres manuais e negócios fechados da NSP:
--  1. VAGA AVULSA: em prédios onde a vaga tem matrícula/SQL próprio, o apartamento e a vaga saem em guias
--     separadas no mesmo dia (8% das vendas de apto da base). A v1 via só o apto e subestimava o preço
--     (Ed. Viareggio: AP 33 R$ 1,163 mi + vaga R$ 87 mil). Agora, quando há UMA venda de apto naquele
--     endereço e dia, as vagas do mesmo dia somam no valor.
--  2. TAMANHO PARECIDO PRIMEIRO: com p_area_util, prefere vendas com área útil estimada a ±35%; o raio cresce
--     até achar 12 nessa faixa; completa com as demais (mais perto primeiro) se faltar.
-- Área útil estimada: casa = área construída; apto = (cadastro − 29 m² da vaga) / 1,35 — mesmo com a vaga vendida
-- à parte (no Viareggio o cadastro do apto, 180 m², já bate com 113 m² úteis por essa fórmula).
-- ═══════════════════════════════════════════════════════════════
create or replace function aval_comps_itbi_raio2(p_lat double precision, p_lng double precision, p_tipo text default 'apto',
                                                 p_lim integer default 20, p_area_util numeric default null)
returns table(logradouro text, numero text, complemento text, valor numeric, valor_imovel numeric, valor_vagas numeric, vagas_avulsas integer,
              area_constr numeric, area_util_est numeric, rs_m2 numeric, na_faixa boolean,
              data date, uso text, lat double precision, lng double precision, dist_m integer, acc smallint)
language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g),
  v as (
    select i.logradouro, i.numero, ltrim(i.numero,'0') n, i.complemento, i.valor, i.area_constr, i.data, i.uso,
           st_y(i.geom) lat, st_x(i.geom) lng, st_distance(i.geom::geography, pt.g::geography)::int d, i.acc
      from aval_itbi i, pt
     where i.geom && st_expand(pt.g, 0.02)
       and i.natureza like '1.%' and coalesce(i.proporcao,100) >= 99
       and i.valor > 0 and i.area_constr > 0
       and i.data >= current_date - interval '18 months'
       and i.uso !~* 'GARAGEM|VAGA|DEP[OÓ]SITO'
       and case when p_tipo='casa' then i.uso ~* '(RESID|CASA|SOBRADO)' and i.uso !~* 'APART|CONDOM'
                else i.uso ~* 'APART' end),
  g as (select i.logradouro, ltrim(i.numero,'0') n, i.data, count(*)::int k, sum(i.valor) vv
          from aval_itbi i, pt
         where p_tipo <> 'casa' and i.geom && st_expand(pt.g, 0.02) and i.uso ~* 'GARAGEM|VAGA'
           and i.natureza like '1.%' and i.data >= current_date - interval '18 months' and i.valor > 0
         group by 1, 2, 3),
  u as (select logradouro, n, data, count(*) na from v group by 1, 2, 3),
  w as (select v.*, case when u.na = 1 and g.k is not null then g.vv else 0 end vv,
                    case when u.na = 1 and g.k is not null then g.k else 0 end kv
          from v join u using (logradouro, n, data) left join g using (logradouro, n, data)),
  x as (select w.*, w.valor + w.vv vt,
               case when p_tipo = 'casa' then w.area_constr
                    else greatest(20, (w.area_constr - 29) / 1.35) end aut
          from w),
  y as (select x.*, round(x.vt / x.area_constr) rs,
               (p_area_util is null or x.aut between p_area_util * 0.65 and p_area_util * 1.35) fx
          from x where x.vt / x.area_constr between 1500 and 40000),
  v5 as (select * from (select y.*, row_number() over (partition by logradouro, n order by data desc) k5 from y) z where k5 <= 5),
  r as (select min(raio) raio from (values (600),(1000),(1500),(2000)) t(raio)
         where (select count(*) from v5 where d <= t.raio and fx) >= least(p_lim, 12))
  select logradouro, numero, complemento, vt, valor, vv, kv, area_constr, round(aut, 1), rs, fx, data, uso, lat, lng, d, acc
    from v5 where d <= coalesce((select raio from r), 2000)
   order by (not fx), d, data desc
   limit greatest(least(p_lim, 40), 1);
$$;
revoke all on function aval_comps_itbi_raio2(double precision,double precision,text,integer,numeric) from public, anon;
grant execute on function aval_comps_itbi_raio2(double precision,double precision,text,integer,numeric) to authenticated;
