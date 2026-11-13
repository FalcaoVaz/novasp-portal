-- 13/11/2026 — fim do acesso extra do piloto Claude Team (dado em 01/10 por sql/2026-10-01-piloto-acesso-total.sql).
-- Cada um volta ao acesso do próprio cargo (valores de antes do piloto, tirados da auditoria de 01/10):
--   Anderson (marketing / assistente de vendas): nível 2; fica com Acervo Nido e Pré-análise (como as demais assistentes); sai do Guess
--   Thais (marketing / assistente de vendas):    nível 3; idem
--   Gabriela (cpd@, marketing):  nível 2, sem Sistema Interno/Calendar por flag (a agenda dela vem da lista do código); sai do Nido, Guess e Pré-análise
--   Dayani (financeiro@, RH):    idem; Recrutamento continua (por e-mail no código)
--   Fabio (TI): continua com acesso total (suporte) — nada muda
--   Fernanda e Renata: as flags já eram delas antes do piloto — nada muda no banco (o acesso total saiu no código)
-- O jurídico já tinha sido fechado em 12/10 (sql/2026-10-12-juridico-restrito.sql). Pode rodar de novo sem erro.
update usuarios set nivel = 2 where lower(email) = 'anderson.lucchi@novasaopaulo.com.br';
update usuarios set nivel = 3 where lower(email) = 'thais.barbosa@novasaopaulo.com.br';
update usuarios set nivel = 2, acesso_interno = false, acesso_calendar = false
 where lower(email) in ('cpd@novasaopaulo.com.br', 'financeiro@novasaopaulo.com.br');

delete from guess_acesso where lower(email) in ('anderson.lucchi@novasaopaulo.com.br','thais.barbosa@novasaopaulo.com.br',
                                                'cpd@novasaopaulo.com.br','financeiro@novasaopaulo.com.br');
delete from nido_acesso where lower(email) in ('cpd@novasaopaulo.com.br','financeiro@novasaopaulo.com.br');
delete from preanalise_acesso where lower(email) in ('cpd@novasaopaulo.com.br','financeiro@novasaopaulo.com.br');

select u.nome, u.nivel, u.acesso_juridico as juridico, u.acesso_interno as interno, u.acesso_calendar as calendar,
       exists (select 1 from nido_acesso n where lower(n.email) = lower(u.email)) as nido,
       exists (select 1 from guess_acesso g where lower(g.email) = lower(u.email)) as guess,
       exists (select 1 from preanalise_acesso p where lower(p.email) = lower(u.email)) as preanalise
  from usuarios u
 where lower(u.email) in ('anderson.lucchi@novasaopaulo.com.br','thais.barbosa@novasaopaulo.com.br','cpd@novasaopaulo.com.br',
                          'financeiro@novasaopaulo.com.br','ti@novasaopaulo.com.br','fernanda.araujo@novasaopaulo.com.br',
                          'renata@novasaopaulo.com.br','vitorcordeiro@novasaopaulo.com.br')
 order by u.nome;
