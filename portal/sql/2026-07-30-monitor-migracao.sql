-- ═══════════════════════════════════════════════════════════════
-- MONITOR DA MIGRACAO PRO SUPABASE AUTH (Fase 1 → Fase 2)
-- Criado em 30/07/2026. Rodar bloco a bloco no SQL Editor.
-- O RLS (rls-fase2.sql, parte 2) so pode ligar quando o bloco 1
-- retornar ZERO linhas.
-- ═══════════════════════════════════════════════════════════════

-- 1) Usuarios ativos que AINDA NAO logaram com o v39+ (sem conta no
--    Auth). Quem tem email invalido/vazio entra pelo email sintetico
--    u<id>@portal.novasaopaulo.local (mesma regra do portal).
select u.nome, u.email
from usuarios u
where u.ativo = true
  and not exists (
    select 1 from auth.users a
    where lower(a.email) = lower(coalesce(nullif(trim(u.email),''), 'x'))
       or a.email = 'u' || u.id || '@portal.novasaopaulo.local'
  )
order by u.nome;

-- 2) Resumo: total de ativos x migrados
select
  count(*) filter (where u.ativo)                       as ativos,
  count(*) filter (where u.ativo and a.id is not null)  as migrados,
  count(*) filter (where u.ativo and a.id is null)      as pendentes
from usuarios u
left join auth.users a
  on lower(a.email) = lower(coalesce(nullif(trim(u.email),''), 'x'))
  or a.email = 'u' || u.id || '@portal.novasaopaulo.local';
