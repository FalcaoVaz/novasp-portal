-- Novo usuário: Vitor Cordeiro, advogado (09/11/2026) — mesmos acessos da Fernanda Araujo.
-- Sem senha: no primeiro acesso ele escolhe o nome na tela de login e cria a própria senha (conta do Supabase Auth criada ali).
-- Pode rodar de novo sem erro.
insert into usuarios (nome, email, nivel, judicial, admin, quota_tokens, tokens_usados, ativo,
                      acesso_juridico, acesso_interno, acesso_calendar, dept, cor_avatar, primeiro_acesso)
select 'Vitor Cordeiro', 'vitorcordeiro@novasaopaulo.com.br', 1, true, false, 500000, 0, true,
       true, true, true, 'Jurídico', '#0F766E', true
where not exists (select 1 from usuarios where lower(email) = 'vitorcordeiro@novasaopaulo.com.br');

-- acervos e pré-análise, como a Fernanda
insert into nido_acesso (email, nome) select 'vitorcordeiro@novasaopaulo.com.br', 'Vitor Cordeiro'
 where not exists (select 1 from nido_acesso where lower(email) = 'vitorcordeiro@novasaopaulo.com.br');
insert into guess_acesso (email, nome) select 'vitorcordeiro@novasaopaulo.com.br', 'Vitor Cordeiro'
 where not exists (select 1 from guess_acesso where lower(email) = 'vitorcordeiro@novasaopaulo.com.br');
insert into preanalise_acesso (email) select 'vitorcordeiro@novasaopaulo.com.br'
 where not exists (select 1 from preanalise_acesso where lower(email) = 'vitorcordeiro@novasaopaulo.com.br');

select nome, email, nivel, judicial, acesso_juridico, acesso_interno, acesso_calendar, dept, ativo,
       exists (select 1 from nido_acesso n where n.email = u.email) as acervo_nido,
       exists (select 1 from guess_acesso g where g.email = u.email) as acervo_guess,
       exists (select 1 from preanalise_acesso p where p.email = u.email) as preanalise
  from usuarios u where lower(email) = 'vitorcordeiro@novasaopaulo.com.br';
