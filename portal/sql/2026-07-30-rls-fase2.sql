-- ═══════════════════════════════════════════════════════════════
-- FASE 2 DA SEGURANCA — RLS em todas as tabelas
-- Criado em 30/07/2026. Rodar bloco a bloco no SQL Editor.
--
-- PARTE 1 pode rodar HOJE (nao desliga nada — so cria a view que o
-- portal v40 ja sabe usar como fallback).
--
-- PARTE 2 e o interruptor. SO RODAR quando o checklist fechar:
--   [ ] Todos os usuarios ativos logaram ao menos uma vez com o v39+
--       (conferir com sql/2026-07-30-monitor-migracao.sql — tem que
--       dar zero pendentes)
--   [ ] Portal v40 e Juridico v63 publicados (ponte de token)
--   [ ] Netlify (site falcaovaz) → env var SUPABASE_KEY trocada pela
--       service_role key (Settings → Environment variables). A function
--       gerar-documento-background grava com ela.
--   [ ] GAS sync-tjsp-datajud.gs e sweeper-bounces.gs: trocar a chave
--       anonima hardcoded pela service_role key e republicar (Implantar
--       → Gerenciar implantacoes → editar a existente → Nova versao)
--   [ ] Avisar a equipe: quem nao migrou perde o acesso ate falar com
--       o Rodrigo (e o "esqueci a senha" deixa de funcionar pra nao
--       migrados)
-- ═══════════════════════════════════════════════════════════════

-- ── PARTE 1 — view minima pra tela de login (rodar hoje) ─────────
-- O login precisa listar nomes/avatares ANTES de autenticar. Com RLS
-- ativo o anonimo nao le mais a tabela usuarios; esta view (security
-- definer, dona = postgres) expoe so o que a tela de login usa.
-- IMPORTANTE: sem senha_hash — a validacao de senha passa a ser do
-- Supabase Auth.

create or replace view public.usuarios_login as
  select id, nome, email, dept, cor_avatar, ativo,
         (senha_hash is not null) as tem_senha
  from public.usuarios;

revoke all on public.usuarios_login from public;
grant select on public.usuarios_login to anon, authenticated;

-- ── PARTE 2 — ativar RLS (SO com o checklist fechado) ────────────
-- Liga RLS em TODAS as tabelas do schema public e cria a politica
-- "usuario logado acessa tudo". Anonimo: bloqueado (sem politica).
-- Granularidade por nivel/modulo fica pra uma fase 3, se quiser.

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('drop policy if exists "acesso autenticado" on public.%I', r.tablename);
    execute format('create policy "acesso autenticado" on public.%I for all to authenticated using (true) with check (true)', r.tablename);
  end loop;
end $$;

-- Conferencia: todas as tabelas com rowsecurity = true
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;

-- ── PARTE 3 — ROLLBACK (emergencia) ──────────────────────────────
-- Desliga o RLS em tudo e volta ao comportamento anterior na hora.
-- (As politicas podem ficar — inofensivas com RLS desligado.)
--
-- do $$
-- declare r record;
-- begin
--   for r in select tablename from pg_tables where schemaname = 'public' loop
--     execute format('alter table public.%I disable row level security', r.tablename);
--   end loop;
-- end $$;
