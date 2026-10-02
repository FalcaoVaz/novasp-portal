-- ═══════════════════════════════════════════════════════════════
-- Projeto Supabase "IPTU" (2º projeto gratuito, só dados públicos de referência).
-- Cadastro fiscal do IPTU (GeoSampa / SF, exercício 2026), recorte Zona Sul (CEP 04xxx).
-- SEM dados pessoais: nome e CPF/CNPJ do contribuinte NÃO são carregados (o loader nem lê essas colunas).
-- ═══════════════════════════════════════════════════════════════
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create table if not exists iptu (
  sql            text primary key,      -- NUMERO DO CONTRIBUINTE (setor-quadra-lote-dígito)
  exercicio      smallint,
  condominio     text,                  -- NUMERO DO CONDOMINIO (une as unidades de um prédio)
  codlog         text,
  logradouro     text,
  logradouro_norm text,                 -- sem acento, maiúsculo, sem tipo (R, AV, AL…)
  numero         text,
  complemento    text,
  bairro         text,
  cep            text,
  fracao_ideal   numeric,
  area_terreno   numeric,
  area_construida numeric,
  area_ocupada   numeric,
  vm2_terreno    numeric,               -- valor do m² de terreno (Planta Genérica de Valores)
  vm2_construcao numeric,
  ano_construcao smallint,
  pavimentos     smallint,
  testada        numeric,
  uso            text,
  padrao         text,
  tipo_terreno   text,
  fator_obsolescencia numeric
);
create index if not exists iptu_end_idx on iptu (logradouro_norm, numero);
create index if not exists iptu_lnorm_trgm on iptu using gin (logradouro_norm gin_trgm_ops);
create index if not exists iptu_cep_idx on iptu (cep);
create index if not exists iptu_cond_idx on iptu (condominio);

create or replace function iptu_norm(t text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(upper(unaccent(coalesce(t,''))),
         '^(RUA|R|AVENIDA|AV|ALAMEDA|AL|TRAVESSA|TV|PRACA|PC|PCA|ESTRADA|ESTR|VIELA|VL|LARGO|LGO|PASSAGEM|PSG)\.?\s+', ''), '\s+', ' ', 'g'))
$$;

-- Busca por endereço: logradouro (aproximado) + número. Devolve as unidades do lote/prédio.
create or replace function iptu_por_endereco(p_logradouro text, p_numero text, p_lim integer default 60)
returns setof iptu language sql stable security definer set search_path = public as $$
  with alvo as (select iptu_norm(p_logradouro) l, regexp_replace(coalesce(p_numero,''),'\D','','g') n)
  select i.* from iptu i, alvo
   where i.logradouro_norm % alvo.l and similarity(i.logradouro_norm, alvo.l) > 0.55
     and regexp_replace(coalesce(i.numero,''),'\D','','g') = alvo.n
   order by similarity(i.logradouro_norm, alvo.l) desc, i.sql
   limit greatest(least(p_lim,300),1);
$$;
create or replace function iptu_por_sql(p_sql text)
returns setof iptu language sql stable security definer set search_path = public as $$
  select * from iptu where sql = p_sql or sql like regexp_replace(p_sql,'\D','','g')||'%' limit 50;
$$;

alter table iptu enable row level security;
