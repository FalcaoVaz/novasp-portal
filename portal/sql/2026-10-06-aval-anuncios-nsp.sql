-- ═══════════════════════════════════════════════════════════════
-- ANÚNCIOS DA NOVA SP na avaliação (Rodrigo, 06/10/2026): "priorizar os nossos; só completar com o
-- QuintoAndar depois dos nossos".
-- Cópia diária dos imóveis DISPONÍVEIS À VENDA no Imoview (API Imovel/RetornarImoveisDisponiveis),
-- só os campos que a avaliação usa: nada de proprietário, número do imóvel ou complemento.
-- Carga: sandbox/imoview_anuncios/carregar_anuncios_nsp.py (rodado pelo Rodrigo; a chave do Imoview
-- fica no Chaveiro do macOS, nunca no repo). A busca é pelo RAIO em volta do pino, não pelo nome do
-- bairro, porque o nome muda de fonte para fonte (ex.: Planalto Paulista × Indianópolis).
-- ═══════════════════════════════════════════════════════════════
create table if not exists aval_anuncios_nsp (
  codigo      bigint primary key,           -- código do Imoview
  ref         text,                         -- código antigo (BI…, MO…, JA…) = codigoauxiliar
  tipo        text,
  grupo       text not null check (grupo in ('apto', 'casa', 'com', 'terreno', 'outro')),
  bairro      text,
  rua         text,                         -- só o logradouro (a API não manda o número)
  area        numeric,                      -- área principal (útil no apartamento, construída na casa)
  terreno     numeric,
  valor       numeric not null,
  dorm        integer,
  vaga        integer,
  lat         double precision not null,
  lng         double precision not null,
  geom        geometry(Point, 4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)) stored,
  alterado_em timestamptz,
  carregado_em timestamptz not null default now()
);
create index if not exists aval_anuncios_nsp_geom_ix on aval_anuncios_nsp using gist (geom);
alter table aval_anuncios_nsp enable row level security;
revoke all on aval_anuncios_nsp from anon, authenticated;

-- Os N anúncios da Nova SP mais perto do ponto, do mesmo grupo (apto/casa), até p_raio_m metros
create or replace function aval_anuncios_nsp_perto(p_lat double precision, p_lng double precision, p_grupo text,
                                                   p_lim integer default 12, p_raio_m integer default 2000)
returns table(ref text, tipo text, bairro text, rua text, area numeric, terreno numeric, valor numeric, rs_m2 integer,
              dorm integer, vaga integer, dist_m integer, carregado_em timestamptz)
language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326) g)
  select a.ref, a.tipo, a.bairro, a.rua, a.area, a.terreno, a.valor, round(a.valor / a.area)::int,
         a.dorm, a.vaga, st_distance(a.geom::geography, pt.g::geography)::int, a.carregado_em
    from aval_anuncios_nsp a, pt
   where a.grupo = p_grupo
     and a.geom && st_expand(pt.g, 0.03)
     and st_dwithin(a.geom::geography, pt.g::geography, least(greatest(p_raio_m, 200), 5000))
     and a.area >= 15 and a.valor >= 50000
     and a.valor / a.area between 1500 and 80000
   order by a.geom <-> pt.g
   limit least(greatest(p_lim, 1), 30);
$$;
revoke all on function aval_anuncios_nsp_perto(double precision, double precision, text, integer, integer) from public, anon;
grant execute on function aval_anuncios_nsp_perto(double precision, double precision, text, integer, integer) to authenticated;

select 'ok — aval_anuncios_nsp + aval_anuncios_nsp_perto' as status;
