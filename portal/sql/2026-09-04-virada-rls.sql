-- ═══════════════════════════════════════════════════════════════
-- VIRADA DO RLS (Fase 2) — 04/09/2026. Rodar bloco a bloco, EM ORDEM.
--
-- Contexto: 19 migrados, mas os 11 usuarios reais ja migraram (todos
-- os que usaram o portal em 30d). Decisao: virar agora; quem nao
-- migrou cadastra senha nova ao entrar.
--
-- CRITICO: pos-RLS, usuario nao-migrado COM senha_hash trava (o login
-- tenta o Auth em modo somenteLogin, nao acha a conta, recusa). Por
-- isso o PASSO 1 zera a senha dos nao-migrados ANTES de ligar o RLS:
-- eles passam a "primeiro acesso" e criam a senha (que ja cria a conta
-- no Auth). Rodar o PASSO 1 ANTES do PASSO 2, sem excecao.
-- ═══════════════════════════════════════════════════════════════

-- ── PASSO 1 — preparar os nao-migrados ──────────────────────────
-- 1a) Conferencia previa: quantos serao zerados (esperado: os 56
--     pendentes que tiverem senha_hash)
select count(*) as vao_virar_primeiro_acesso
from usuarios u
where u.ativo
  and u.senha_hash is not null
  and not exists (
    select 1 from auth.users a
    where lower(a.email) = lower(coalesce(nullif(trim(u.email),''), 'x'))
       or a.email = 'u' || u.id || '@portal.novasaopaulo.local'
  );

-- 1b) Zera a senha dos ativos nao-migrados → viram "primeiro acesso".
--     NAO toca em quem ja migrou (esses logam normal com a senha atual).
update usuarios u
set senha_hash = null, primeiro_acesso = true
where u.ativo
  and u.senha_hash is not null
  and not exists (
    select 1 from auth.users a
    where lower(a.email) = lower(coalesce(nullif(trim(u.email),''), 'x'))
       or a.email = 'u' || u.id || '@portal.novasaopaulo.local'
  );

-- ── PASSO 2 — ligar o RLS em todas as tabelas ───────────────────
-- Politica unica: usuario autenticado (logado no Auth) acessa tudo.
-- Anonimo: sem politica = bloqueado. A view usuarios_login (ja criada,
-- SECURITY DEFINER) continua servindo a tela de login pro anon.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('drop policy if exists "acesso autenticado" on public.%I', r.tablename);
    execute format('create policy "acesso autenticado" on public.%I for all to authenticated using (true) with check (true)', r.tablename);
  end loop;
end $$;

-- 2b) Garante que o anon ainda le a view de login (RLS nao afeta views,
--     mas reforca o grant caso algum passo anterior tenha mexido)
grant select on public.usuarios_login to anon, authenticated;

-- ── PASSO 3 — conferencia ───────────────────────────────────────
select count(*) filter (where rowsecurity) as tabelas_com_rls,
       count(*)                              as total_tabelas
from pg_tables where schemaname = 'public';

-- ── ROLLBACK de emergencia (se algo der errado) ─────────────────
-- do $$
-- declare r record;
-- begin
--   for r in select tablename from pg_tables where schemaname='public' loop
--     execute format('alter table public.%I disable row level security', r.tablename);
--   end loop;
-- end $$;
