-- ═══════════════════════════════════════════════════════════════
-- MATRÍCULA E CARTÓRIO por contribuinte (SQL), das guias de ITBI da Prefeitura de 2010 a 2026 (15/10/2026).
-- Para cada SQL fica a guia MAIS RECENTE (a matrícula pode ter mudado por unificação ou desdobro).
-- Só existe para imóvel que teve guia de ITBI no período (venda, doação, permuta etc.); para os outros não há dado público.
-- Carga: sandbox/carregar_matriculas.py (lê sandbox/matriculas/matriculas_itbi.csv, gerado por matriculas_itbi.py).
-- Dado público da Prefeitura, sem nome de proprietário. Rodar no SQL Editor do falcaovaz-juridico.
-- ═══════════════════════════════════════════════════════════════
create table if not exists aval_matricula (
  sql       text primary key,                -- 11 dígitos, com o dígito verificador (ex.: 04727802082)
  matricula text not null,
  cartorio  text,                            -- número do Cartório de Registro de Imóveis (ex.: "14")
  data      date                             -- data da guia de onde saiu
);
alter table aval_matricula enable row level security;
revoke all on aval_matricula from anon, authenticated;

-- Matrícula de um ou mais contribuintes (aceita qualquer formato: "047.278.0208-2", "04727802082")
create or replace function aval_matricula_por_sql(p_sqls text[])
returns table(sql text, matricula text, cartorio text, data date)
language sql stable security definer set search_path = public as $$
  select m.sql, m.matricula, m.cartorio, m.data
    from aval_matricula m
   where m.sql = any (select lpad(regexp_replace(x, '\D', '', 'g'), 11, '0') from unnest(p_sqls) x where x is not null)
$$;
revoke all on function aval_matricula_por_sql(text[]) from public, anon;
grant execute on function aval_matricula_por_sql(text[]) to authenticated;

select 'ok — aval_matricula' as status;
