-- ═══════════════════════════════════════════════════════════════
-- MÓDULO DE AVALIAÇÕES — tabela de RESULTADO (dossiê apresentável). 13/09/2026.
--
-- Desenho: o motor roda em LOTE (todo imóvel da carteira gera avaliação)
-- e grava aqui só o que PODE ser mostrado — ao corretor e ao proprietário.
-- Dado sensível (nome/contato do proprietário, base bruta) NUNCA entra aqui;
-- fica nas tabelas fechadas (aval_carteira_snapshot etc., só service_role).
--
-- Segurança:
--   • anon  → SEM acesso direto à tabela. O link público lê UMA linha via
--             a função aval_por_token() (security definer), nunca a lista.
--   • authenticated (corretor logado) → LÊ tudo (revisar) e ATUALIZA só o
--             status (aprovar/rejeitar). Não pode inserir nem apagar.
--   • service_role (motor em lote) → escreve tudo.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create table if not exists aval_resultado (
  id            bigserial primary key,
  fonte         text not null default 'nido',
  codigo        text not null,
  gerado_em     timestamptz not null default now(),
  token         text not null unique default encode(gen_random_bytes(9), 'hex'),

  -- identificação do imóvel (o que aparece no dossiê)
  tipo          text, bairro text, endereco text, edificio text,
  area_util     numeric(8,2), terreno numeric(8,2),
  dorm smallint, suite smallint, vaga smallint,
  preco_pedido  numeric(14,2),

  -- valor de mercado
  valor_mercado numeric(14,2), faixa_min numeric(14,2), faixa_max numeric(14,2),
  mercado_rs_m2 numeric(12,2), anuncios_usados int, metodo text,

  -- potencial de incorporação (casa em eixo)
  zona          text, ca numeric(4,2),
  incorp_aplicavel   boolean not null default false,
  incorp_area_constr numeric(12,2),
  incorp_lancamento_rs_m2 numeric(12,2),
  incorp_vgv         numeric(16,2),
  incorp_valor_terreno numeric(14,2),
  incorp_ganho_pct   numeric(6,2),

  -- comparáveis anonimizados (sem dono, sem endereço exato): [{rs_m2,area,preco,tipo}]
  comparaveis   jsonb,

  -- fluxo de revisão
  status        text not null default 'gerada',   -- gerada | aprovada | rejeitada
  aprovado_por  text, aprovado_em timestamptz, observacao text,

  unique (fonte, codigo)
);
create index if not exists aval_res_status_ix on aval_resultado (status, bairro);
create index if not exists aval_res_token_ix  on aval_resultado (token);

-- ── RLS ─────────────────────────────────────────────────────────
alter table aval_resultado enable row level security;
revoke all on aval_resultado from anon, authenticated;
grant  select on aval_resultado to authenticated;
grant  update (status, aprovado_por, aprovado_em, observacao) on aval_resultado to authenticated;

drop policy if exists aval_res_sel on aval_resultado;
create policy aval_res_sel on aval_resultado
  for select to authenticated using (true);

drop policy if exists aval_res_upd on aval_resultado;
create policy aval_res_upd on aval_resultado
  for update to authenticated using (true) with check (true);

-- ── Link público: uma linha por token, via função (bypassa RLS com segurança)
-- Devolve só os campos apresentáveis ao proprietário. Sem status interno,
-- sem observação do corretor, sem código interno.
create or replace function aval_por_token(p_token text)
returns table (
  tipo text, bairro text, endereco text, edificio text,
  area_util numeric, terreno numeric, dorm smallint, suite smallint, vaga smallint,
  valor_mercado numeric, faixa_min numeric, faixa_max numeric,
  mercado_rs_m2 numeric, anuncios_usados int, metodo text,
  zona text, ca numeric, incorp_aplicavel boolean,
  incorp_area_constr numeric, incorp_lancamento_rs_m2 numeric,
  incorp_vgv numeric, incorp_valor_terreno numeric, incorp_ganho_pct numeric,
  comparaveis jsonb, gerado_em timestamptz
)
language sql security definer set search_path = public as $$
  select tipo,bairro,endereco,edificio,area_util,terreno,dorm,suite,vaga,
         valor_mercado,faixa_min,faixa_max,mercado_rs_m2,anuncios_usados,metodo,
         zona,ca,incorp_aplicavel,incorp_area_constr,incorp_lancamento_rs_m2,
         incorp_vgv,incorp_valor_terreno,incorp_ganho_pct,comparaveis,gerado_em
    from aval_resultado
   where token = p_token and status = 'aprovada'   -- só dossiê já revisado vaza pro dono
   limit 1;
$$;
revoke all on function aval_por_token(text) from public;
grant execute on function aval_por_token(text) to anon, authenticated;

select 'ok — aval_resultado + aval_por_token criados' as status;
