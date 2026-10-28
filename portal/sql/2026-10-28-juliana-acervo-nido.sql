-- ═══════════════════════════════════════════════════════════════
-- 28/10/2026: Juliana Sousa (secretária/assistente de vendas de Moema, no lugar do Jean) + Acervo com Nido separado do Guess
-- (a parte do Acervo é o SQL 2026-10-22-acervo-nido-separado.sql, que ainda não tinha rodado). Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
begin;

-- 1) Juliana no portal (primeiro acesso: ela cria a senha ao entrar com o e-mail)
insert into usuarios (nome, email, nivel, dept, cor_avatar, ativo, primeiro_acesso)
select 'Juliana Sousa', 'julianasousa@novasaopaulo.com.br', 3, 'Assistente de Vendas - Moema', '#1E4D99', true, true
 where not exists (select 1 from usuarios where lower(email) = 'julianasousa@novasaopaulo.com.br');

-- 2) Acervo: Nido e Guess com listas separadas; assistentes só no Nido
create table if not exists nido_acesso (email text primary key, nome text, criado_em timestamptz not null default now());
alter table nido_acesso enable row level security;
revoke all on nido_acesso from anon, authenticated;
insert into nido_acesso (email, nome) select email, nome from guess_acesso on conflict do nothing;
insert into nido_acesso (email, nome) values ('julianasousa@novasaopaulo.com.br', 'Juliana Sousa') on conflict do nothing;

create or replace function guess_pode_ler() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guess_acesso a where a.email = lower(coalesce(auth.jwt()->>'email', '')))
      or exists (select 1 from usuarios u where u.admin and coalesce(u.ativo, true) and lower(u.email) = lower(coalesce(auth.jwt()->>'email', '')));
$$;
create or replace function nido_pode_ler() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from nido_acesso a where a.email = lower(coalesce(auth.jwt()->>'email', '')))
      or exists (select 1 from usuarios u where u.admin and coalesce(u.ativo, true) and lower(u.email) = lower(coalesce(auth.jwt()->>'email', '')));
$$;
create or replace function acervo_pode_ler() returns boolean
language sql stable security definer set search_path = public as $$
  select guess_pode_ler() or nido_pode_ler();
$$;
revoke all on function guess_pode_ler() from public, anon;
revoke all on function nido_pode_ler() from public, anon;
grant execute on function guess_pode_ler() to authenticated;
grant execute on function nido_pode_ler() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['guess_clientes','guess_contratos','guess_imoveis','guess_inquilinos'] loop
    execute format('drop policy if exists acervo_gerentes on %I', t);
    execute format('create policy acervo_gerentes on %I for select to authenticated using (guess_pode_ler())', t);
  end loop;
  foreach t in array array['nido_imoveis','nido_pessoas','nido_propostas','nido_fechamentos','nido_corretores'] loop
    execute format('drop policy if exists acervo_gerentes on %I', t);
    execute format('create policy acervo_gerentes on %I for select to authenticated using (nido_pode_ler())', t);
  end loop;
  if to_regclass('public.nido_captadores') is not null then
    execute 'drop policy if exists acervo_nido on nido_captadores';
    execute 'create policy acervo_nido on nido_captadores for select to authenticated using (nido_pode_ler())';
  end if;
end $$;

delete from guess_acesso where email in ('camille.cassab@novasaopaulo.com.br','amanda@novasaopaulo.com.br',
                                         'karina.silva@novasaopaulo.com.br','leticia.andrade@novasaopaulo.com.br');
commit;

select nome, email, dept, primeiro_acesso from usuarios where email = 'julianasousa@novasaopaulo.com.br';
