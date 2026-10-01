-- ═══════════════════════════════════════════════════════════════
-- AUDITORIA — registro de quem mexeu em quê (pedido do Rodrigo, 01/10/2026, para o piloto)
-- Trigger genérica grava INSERT/UPDATE/DELETE das tabelas importantes em `auditoria`, com o e-mail
-- do usuário logado (JWT), a tabela, a chave, e o antes/depois (só as colunas que mudaram, no UPDATE).
-- Leitura pela API: só admins (policy). Escrita: só a trigger (security definer); API não insere.
-- ═══════════════════════════════════════════════════════════════
create table if not exists auditoria (
  id        bigint generated always as identity primary key,
  quando    timestamptz not null default now(),
  usuario   text,                 -- e-mail do JWT (ou 'service'/'anon')
  tabela    text not null,
  operacao  text not null,        -- INSERT | UPDATE | DELETE
  chave     text,                 -- id da linha
  antes     jsonb,
  depois    jsonb
);
create index if not exists idx_auditoria_quando on auditoria (quando desc);
create index if not exists idx_auditoria_tabela on auditoria (tabela, quando desc);
create index if not exists idx_auditoria_usuario on auditoria (usuario, quando desc);
alter table auditoria enable row level security;
revoke all on auditoria from anon, authenticated;
grant select on auditoria to authenticated;
drop policy if exists auditoria_admin on auditoria;
create policy auditoria_admin on auditoria for select to authenticated
  using (exists (select 1 from usuarios u where u.admin and lower(u.email) = lower(coalesce(auth.jwt()->>'email',''))));

create or replace function auditoria_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_usuario text := coalesce(auth.jwt()->>'email', current_setting('request.jwt.claim.role', true), current_user);
  v_antes jsonb; v_depois jsonb; v_chave text;
begin
  if tg_op = 'INSERT' then
    v_depois := to_jsonb(new); v_chave := coalesce(v_depois->>'id', v_depois->>'email');
  elsif tg_op = 'DELETE' then
    v_antes := to_jsonb(old); v_chave := coalesce(v_antes->>'id', v_antes->>'email');
  else
    v_chave := coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'email');
    -- só o que mudou (ignora carimbos de atualização)
    select jsonb_object_agg(k, o.v), jsonb_object_agg(k, n.v) into v_antes, v_depois
      from jsonb_each(to_jsonb(old)) o(k, v) join jsonb_each(to_jsonb(new)) n(k, v) using (k)
     where o.v is distinct from n.v and k not in ('atualizado_em','updated_at');
    if v_depois is null then return null; end if;   -- nada relevante mudou
  end if;
  -- nunca guarda senha
  v_antes := v_antes - 'senha_hash'; v_depois := v_depois - 'senha_hash';
  insert into auditoria (usuario, tabela, operacao, chave, antes, depois)
  values (v_usuario, tg_table_name, tg_op, v_chave, v_antes, v_depois);
  return null;
end $$;

-- Tabelas auditadas (acrescente aqui o que mais importar)
do $$ declare t text; begin
  foreach t in array array['usuarios','agenda_eventos','aval_resultado','vendas_corretores','vendas_cotas',
                           'vendas_captacoes_mensais','vendas_planilhas_importacoes','guess_acesso',
                           'processos','acordos_extrajudiciais','gestao_perguntas'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists trg_auditoria on %I', t);
      execute format('create trigger trg_auditoria after insert or update or delete on %I for each row execute function auditoria_trigger()', t);
    end if;
  end loop;
end $$;
select 'ok — auditoria em ' || (select count(*) from pg_trigger where tgname='trg_auditoria') || ' tabelas' as status;
