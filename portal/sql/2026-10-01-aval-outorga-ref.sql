-- ═══════════════════════════════════════════════════════════════
-- Outorga onerosa CONCEDIDA (GeoSampa, camada "Outorga Onerosa", baixada em 01/10/2026):
-- 5.239 processos com endereço, área do terreno, área excedente e contrapartida paga.
-- Serve para calibrar a conta de incorporação com o que a prefeitura cobrou de fato,
-- por proximidade (R$/m² excedente dos processos mais próximos). Dado público, sem pessoa.
-- Carga: sandbox/carregar_outorga.py (lê o CSV em foca/dados/geosampa/outorga_onerosa_20261001.csv).
-- ═══════════════════════════════════════════════════════════════
create table if not exists aval_outorga_ref (
  id               integer primary key,
  distrito         text,
  setor_quadra     text,
  endereco         text,
  area_terreno     numeric(12,2),
  coef_utilizacao  numeric(8,4),
  categoria_uso    text,
  tipo_uso         text,
  area_excedente   numeric(12,2),
  contrapartida    numeric(14,2),
  ct_m2            numeric(12,2),        -- contrapartida / área excedente
  situacao         text,
  alvara           text,
  processo         text,
  geom             geometry(Point, 4326)
);
create index if not exists idx_aval_outorga_geom on aval_outorga_ref using gist (geom);
alter table aval_outorga_ref enable row level security;
revoke all on aval_outorga_ref from anon, authenticated;

-- Processos mais próximos do ponto (raio em metros), com distância — a tela calcula a mediana
create or replace function aval_outorga_ref(p_lat double precision, p_lng double precision, p_raio_m integer default 1500, p_lim integer default 30)
returns table(id integer, distrito text, endereco text, area_terreno numeric, area_excedente numeric, contrapartida numeric, ct_m2 numeric, situacao text, alvara text, dist_m integer, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography g)
  select o.id, o.distrito, o.endereco, o.area_terreno, o.area_excedente, o.contrapartida, o.ct_m2, o.situacao, o.alvara,
         st_distance(o.geom::geography, pt.g)::integer as dist_m, st_y(o.geom), st_x(o.geom)
    from aval_outorga_ref o, pt
   where o.ct_m2 between 50 and 20000 and o.situacao in ('QUITADO','ARRECADADO','COMPROMETIDO')
     and st_dwithin(o.geom::geography, pt.g, p_raio_m)
   order by st_distance(o.geom::geography, pt.g)
   limit p_lim;
$$;
revoke all on function aval_outorga_ref(double precision,double precision,integer,integer) from public, anon;
grant execute on function aval_outorga_ref(double precision,double precision,integer,integer) to authenticated;
select 'ok — aval_outorga_ref' as status;
