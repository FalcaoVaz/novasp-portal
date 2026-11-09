-- ═══════════════════════════════════════════════════════════════
-- BÚSSOLA NSP no portal — EM TESTE (09/11/2026). Projeto de Emilia Vitória e Camille Cassab.
-- O sistema delas roda dentro do portal (portal/bussola/), com o login do portal. O que no Netlify delas ficava no
-- Netlify Blobs (alertas, notificações e auditoria) fica aqui, em bussola_blobs, com a mesma chave e o mesmo conteúdo.
-- Quem vê o card: quem está em bussola_acesso e os administradores do portal. Para incluir alguém no teste:
--   insert into bussola_acesso (email) values ('fulano@novasaopaulo.com.br');
-- Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════

create table if not exists bussola_acesso (
  email     text primary key,
  incluido_em timestamptz not null default now()
);
insert into bussola_acesso (email) values
  ('rodrigo@novasaopaulo.com.br'), ('emilia.vitoria@novasaopaulo.com.br'), ('camille.cassab@novasaopaulo.com.br')
on conflict (email) do nothing;

create or replace function bussola_pode() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bussola_acesso a where a.email = lower(coalesce(auth.jwt()->>'email', '')))
      or exists (select 1 from usuarios u where u.admin and coalesce(u.ativo, true) and lower(u.email) = lower(coalesce(auth.jwt()->>'email', '')));
$$;
create or replace function bussola_eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios u where u.admin and coalesce(u.ativo, true) and lower(u.email) = lower(coalesce(auth.jwt()->>'email', '')));
$$;
revoke all on function bussola_pode() from public, anon;
revoke all on function bussola_eh_admin() from public, anon;
grant execute on function bussola_pode() to authenticated;
grant execute on function bussola_eh_admin() to authenticated;

alter table bussola_acesso enable row level security;
revoke all on bussola_acesso from anon, authenticated;
grant select on bussola_acesso to authenticated;
drop policy if exists bussola_acesso_ver on bussola_acesso;
create policy bussola_acesso_ver on bussola_acesso for select to authenticated
  using (email = lower(coalesce(auth.jwt()->>'email', '')) or bussola_eh_admin());

-- "lojas" do sistema delas: radar-alertas (alertas e notificações de cada pessoa) e radar-auditoria (registro de ações)
create table if not exists bussola_blobs (
  loja          text not null,
  chave         text not null,
  valor         text,
  dono          text not null default lower(coalesce(auth.jwt()->>'email', '')),
  atualizado_em timestamptz not null default now(),
  primary key (loja, chave)
);
create index if not exists bussola_blobs_prefixo_ix on bussola_blobs (loja, chave text_pattern_ops);

alter table bussola_blobs enable row level security;
revoke all on bussola_blobs from anon, authenticated;
grant select, insert, update, delete on bussola_blobs to authenticated;
drop policy if exists bussola_blobs_alertas on bussola_blobs;
drop policy if exists bussola_blobs_aud_inserir on bussola_blobs;
drop policy if exists bussola_blobs_aud_ler on bussola_blobs;
-- alertas e notificações: cada pessoa só mexe nos seus
create policy bussola_blobs_alertas on bussola_blobs for all to authenticated
  using (loja = 'radar-alertas' and bussola_pode() and dono = lower(coalesce(auth.jwt()->>'email', '')))
  with check (loja = 'radar-alertas' and bussola_pode() and dono = lower(coalesce(auth.jwt()->>'email', '')));
-- auditoria: cada um grava as próprias ações; só administradores leem; ninguém altera ou apaga
create policy bussola_blobs_aud_inserir on bussola_blobs for insert to authenticated
  with check (loja = 'radar-auditoria' and bussola_pode() and dono = lower(coalesce(auth.jwt()->>'email', '')));
create policy bussola_blobs_aud_ler on bussola_blobs for select to authenticated
  using (loja = 'radar-auditoria' and bussola_eh_admin());

select 'ok — Bússola NSP (teste): bussola_acesso + bussola_blobs' as status;
