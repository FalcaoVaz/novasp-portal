-- ═══════════════════════════════════════════════════════════════
-- LOGIN ÚNICO DA ÁREA DO CORRETOR (site → Avaliação do portal) — 14/10/2026.
-- Decisão do Rodrigo: para corretores vale o login do SITE (e-mail @novasaopaulo.com.br + código). O site gera um
-- passe assinado; a função sso-corretor (jurídico/Netlify) confere o passe, cria a conta no Supabase Auth se faltar e
-- abre a sessão; o portal chama portal_entrar_corretor() para achar ou criar a linha em "usuarios" e abre SÓ a Avaliação.
--
-- E o mais importante: quem tem perfil "corretor" (criado pelo site) fica preso no banco à Avaliação. As políticas
-- "acesso autenticado" (qualquer logado lê e altera tudo) passam a valer só para a equipe interna; o corretor do site
-- vê só a própria linha em usuarios e só as próprias avaliações. A equipe interna não muda nada.
-- Rodar no SQL Editor do falcaovaz-juridico (depois do 2026-10-12-juridico-restrito.sql). Pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════
begin;

-- 1) Passe de uso único (a função grava com service_role; ninguém mais lê nem grava)
create table if not exists sso_nonces (nonce text primary key, criado_em timestamptz not null default now());
alter table sso_nonces enable row level security;
revoke all on sso_nonces from anon, authenticated;

-- 2) Perfil na tabela de usuários: 'corretor' = entra pela Área do Corretor do site, só a Avaliação
alter table usuarios add column if not exists perfil text;

-- 3) Quem é corretor do site (pelo e-mail do token)
create or replace function eh_corretor_site() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios u where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and u.perfil = 'corretor');
$$;
revoke all on function eh_corretor_site() from public, anon;
grant execute on function eh_corretor_site() to authenticated;

-- 4) Acha ou cria a linha do corretor em "usuarios" (chamada pelo portal logo depois do login único).
--    Só cria para e-mail @novasaopaulo.com.br. Conta que já existe NÃO muda de perfil (gestor que abrir pelo site continua gestor).
create or replace function portal_entrar_corretor(p_nome text default null) returns setof usuarios
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if em = '' or em !~ '@novasaopaulo\.com\.br$' then return; end if;
  if not exists (select 1 from usuarios where lower(email) = em) then
    insert into usuarios (nome, email, dept, perfil, ativo, admin, judicial, acesso_juridico, acesso_interno, acesso_calendar, primeiro_acesso, nivel)
    values (coalesce(nullif(trim(p_nome), ''), split_part(em, '@', 1)), em, 'Corretor', 'corretor', true, false, false, false, false, false, false, 3);
  end if;
  return query select * from usuarios where lower(email) = em and coalesce(ativo, true) limit 1;
end $$;
revoke all on function portal_entrar_corretor(text) from public, anon;
grant execute on function portal_entrar_corretor(text) to authenticated;

-- 5) Toda política aberta a qualquer logado (using true / with check true, com qualquer nome) passa a valer só para
--    quem NÃO é corretor do site. Mesmo nome, mesmo comando: para a equipe interna nada muda.
do $$
declare r record; u text; c text;
begin
  for r in select tablename, policyname, cmd from pg_policies
            where schemaname = 'public' and 'authenticated' = any(roles)
              and (qual = 'true' or (qual is null and with_check = 'true')) loop
    u := case when r.cmd in ('SELECT', 'DELETE', 'UPDATE', 'ALL') then ' using (not eh_corretor_site())' else '' end;
    c := case when r.cmd in ('INSERT', 'UPDATE', 'ALL') then ' with check (not eh_corretor_site())' else '' end;
    execute format('drop policy %I on %I', r.policyname, r.tablename);
    execute format('create policy %I on %I for %s to authenticated', r.policyname, r.tablename, r.cmd) || u || c;
  end loop;
end $$;

-- 6) O que o corretor do site pode: a própria linha em usuarios e as próprias avaliações
drop policy if exists corretor_propria_conta on usuarios;
create policy corretor_propria_conta on usuarios for select to authenticated
  using (eh_corretor_site() and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists corretor_proprias_avaliacoes on aval_resultado;
create policy corretor_proprias_avaliacoes on aval_resultado for all to authenticated
  using (eh_corretor_site() and corretor_nome = (select u.nome from usuarios u where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1))
  with check (eh_corretor_site() and corretor_nome = (select u.nome from usuarios u where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')) limit 1));

commit;

-- Conferência: não pode sobrar política aberta a qualquer logado (o esperado é 0)
select count(*) as politicas_abertas_restantes from pg_policies
 where schemaname = 'public' and 'authenticated' = any(roles) and (qual = 'true' or (qual is null and with_check = 'true'));
