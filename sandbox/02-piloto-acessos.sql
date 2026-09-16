-- ═══════════════════════════════════════════════════════════════
-- MODO PILOTO (SANDBOX) — eleva os 8 participantes a acesso total.
-- Rodar SÓ no banco de teste. O carregar_sandbox.py já roda isto
-- automaticamente ao fim da carga (a recarga de segunda restaura as
-- flags de produção/restritas). Aqui fica a versão avulsa, de referência.
-- NÃO rodar na produção.
-- ═══════════════════════════════════════════════════════════════

update usuarios
   set admin = true,
       judicial = true,
       acesso_juridico = true,
       acesso_interno = true,
       acesso_calendar = true,
       nivel = 1
 where lower(email) in (
   'rodrigo@novasaopaulo.com.br',          -- Rodrigo
   'anderson.lucchi@novasaopaulo.com.br',  -- Anderson
   'cpd@novasaopaulo.com.br',              -- Gabriela
   'thais.barbosa@novasaopaulo.com.br',    -- Thais
   'financeiro@novasaopaulo.com.br',       -- Dayani (Day)
   'ti@novasaopaulo.com.br',               -- Fabio
   'fernanda.araujo@novasaopaulo.com.br',  -- Fernanda (jurídico)
   'renata@novasaopaulo.com.br'            -- Renata Navarro
 );

select email, admin, acesso_juridico, acesso_interno, acesso_calendar, nivel
  from usuarios
 where lower(email) in (
   'rodrigo@novasaopaulo.com.br','anderson.lucchi@novasaopaulo.com.br',
   'cpd@novasaopaulo.com.br','thais.barbosa@novasaopaulo.com.br',
   'financeiro@novasaopaulo.com.br','ti@novasaopaulo.com.br',
   'fernanda.araujo@novasaopaulo.com.br','renata@novasaopaulo.com.br')
 order by email;
