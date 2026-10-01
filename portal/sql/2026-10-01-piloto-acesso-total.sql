-- Piloto Claude Team: acesso total ao portal para os participantes (decisão do Rodrigo, 01/10/2026).
-- RODAR NO SQL EDITOR (o Rodrigo). Flags de módulo no banco (jurídico, interno, calendar, nível 1);
-- os papéis de JS (Gestão, Vendas, gestão de corretores, fórum, acervo) vêm de ACESSO_TOTAL_EMAILS
-- no 02-manutencao.js (v76). NÃO dá admin (admin apaga usuários etc.). Rodrigo já é admin.
update usuarios set acesso_juridico = true, acesso_interno = true, acesso_calendar = true, nivel = 1
 where lower(email) in ('anderson.lucchi@novasaopaulo.com.br','cpd@novasaopaulo.com.br','thais.barbosa@novasaopaulo.com.br',
                        'financeiro@novasaopaulo.com.br','ti@novasaopaulo.com.br','fernanda.araujo@novasaopaulo.com.br','renata@novasaopaulo.com.br');
-- Acervo (Nido + Guess): entra na lista de leitura
insert into guess_acesso (email, nome)
select lower(email), nome from usuarios
 where lower(email) in ('anderson.lucchi@novasaopaulo.com.br','cpd@novasaopaulo.com.br','thais.barbosa@novasaopaulo.com.br','financeiro@novasaopaulo.com.br')
on conflict (email) do nothing;
select nome, email, acesso_juridico, acesso_interno, acesso_calendar, nivel from usuarios
 where lower(email) in ('anderson.lucchi@novasaopaulo.com.br','cpd@novasaopaulo.com.br','thais.barbosa@novasaopaulo.com.br','financeiro@novasaopaulo.com.br','ti@novasaopaulo.com.br','fernanda.araujo@novasaopaulo.com.br','renata@novasaopaulo.com.br') order by nome;
