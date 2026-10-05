-- Líderes do usuário logado no módulo Gestão (gestao_liderados ativo). Usado para o PERFIL CORRETOR (05/10/2026):
-- quem está abaixo de um gerente de vendas (Renata, Felippe, Emília, Christiane) e não é assistente vê só a Avaliação
-- e o que faz sentido para corretor. Devolve os nomes dos líderes; a regra fica no portal (02-manutencao.js, ehCorretor).
create or replace function meus_lideres() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct l.nome), '{}')
    from gestao_liderados g
    join usuarios c on c.id = g.colaborador_id
    join usuarios l on l.id = g.lider_id
   where g.ativo and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
revoke all on function meus_lideres() from public, anon;
grant execute on function meus_lideres() to authenticated;
