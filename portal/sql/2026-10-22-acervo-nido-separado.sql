-- ═══════════════════════════════════════════════════════════════
-- ACERVO: acesso ao NIDO separado do GUESS (Rodrigo, 22/10/2026)
-- Até aqui Nido e Guess usavam a mesma lista (guess_acesso). As assistentes de vendas precisam só do Nido
-- (para completar no Imoview os imóveis que não subiram certo), não dos contratos de locação do Guess.
--   · nido_acesso ...... nova lista do Nido (começa com todos que já tinham o Acervo)
--   · guess_acesso ..... continua sendo a lista do Guess
--   · nido_pode_ler() / guess_pode_ler() decidem cada tabela; acervo_pode_ler() = um OU outro (card do Acervo no portal)
-- Assistentes (Camille, Amanda, Karina, Leticia): ficam só no Nido.
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
begin;

create table if not exists nido_acesso (
  email     text primary key,
  nome      text,
  criado_em timestamptz not null default now()
);
alter table nido_acesso enable row level security;
revoke all on nido_acesso from anon, authenticated;
insert into nido_acesso (email, nome) select email, nome from guess_acesso on conflict do nothing;

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

-- cada tabela com a sua lista
do $$
declare t text;
begin
  foreach t in array array['guess_clientes', 'guess_contratos', 'guess_imoveis', 'guess_inquilinos'] loop
    execute format('drop policy if exists acervo_gerentes on %I', t);
    execute format('create policy acervo_gerentes on %I for select to authenticated using (guess_pode_ler())', t);
  end loop;
  foreach t in array array['nido_imoveis', 'nido_pessoas', 'nido_propostas', 'nido_fechamentos', 'nido_corretores'] loop
    execute format('drop policy if exists acervo_gerentes on %I', t);
    execute format('create policy acervo_gerentes on %I for select to authenticated using (nido_pode_ler())', t);
  end loop;
end $$;

-- assistentes: só Nido
delete from guess_acesso where email in ('camille.cassab@novasaopaulo.com.br', 'amanda@novasaopaulo.com.br',
                                         'karina.silva@novasaopaulo.com.br', 'leticia.andrade@novasaopaulo.com.br');

commit;

-- Conferência: quem vê o quê
select coalesce(n.email, g.email) as email, n.email is not null as nido, g.email is not null as guess
  from nido_acesso n full join guess_acesso g on g.email = n.email order by 1;
