-- ═══════════════════════════════════════════════════════════════
-- JURÍDICO SÓ PARA O JURÍDICO (Rodrigo, 12/10/2026) — 1ª etapa do fechamento do banco.
-- Até aqui as tabelas do jurídico tinham a política "acesso autenticado" (qualquer pessoa logada no portal lia e
-- alterava processos, prazos, documentos etc. pela API, mesmo sem ver na tela). Agora só quem tem acesso ao jurídico.
--   Ficam com acesso: Rodrigo (admin), Durval, Edna, Fernanda, Janaina e João Marcos. Os demais perdem a flag.
--   Financeiro do jurídico: desativado (não é usado, 0 lançamentos) — ninguém lê nem grava pela API.
--   ia_jobs: o jurídico vê tudo; os outros só os jobs de parecer de avaliação (par-…), que o portal lê.
-- As funções do Netlify e o GAS gravam com service_role, que passa por cima da RLS: nada muda para elas.
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
begin;

-- 1) Quem fica com o jurídico
update usuarios
   set acesso_juridico = lower(coalesce(email, '')) in ('rodrigo@novasaopaulo.com.br', 'diretor@novasaopaulo.com.br', 'edna@novasaopaulo.com.br',
                                                        'fernanda.araujo@novasaopaulo.com.br', 'janaina.alves@novasaopaulo.com.br', 'joao@novasaopaulo.com.br')
 where acesso_juridico is distinct from (lower(coalesce(email, '')) in ('rodrigo@novasaopaulo.com.br', 'diretor@novasaopaulo.com.br', 'edna@novasaopaulo.com.br',
                                                        'fernanda.araujo@novasaopaulo.com.br', 'janaina.alves@novasaopaulo.com.br', 'joao@novasaopaulo.com.br'));

-- 2) Quem é do jurídico, pelo login (e-mail do token)
create or replace function eh_juridico() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios u
                  where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
                    and coalesce(u.ativo, true) and (u.acesso_juridico or u.admin));
$$;
revoke all on function eh_juridico() from public, anon;
grant execute on function eh_juridico() to authenticated;

-- 3) Tabelas do jurídico: só o jurídico
do $$
declare t text;
begin
  foreach t in array array['processos', 'andamentos_processos', 'prazos', 'acordos_extrajudiciais', 'documentos',
                           'calculos_atualizacao', 'notificacoes_email', 'chamados'] loop
    execute format('drop policy if exists "acesso autenticado" on %I', t);
    execute format('drop policy if exists juridico on %I', t);
    execute format('create policy juridico on %I for all to authenticated using (eh_juridico()) with check (eh_juridico())', t);
  end loop;
end $$;

-- 4) Financeiro do jurídico: desativado (sem política = ninguém pela API)
drop policy if exists "acesso autenticado" on financeiro;

-- 5) Fila da IA: jurídico vê tudo; os demais só os pareceres de avaliação
drop policy if exists "acesso autenticado" on ia_jobs;
drop policy if exists ia_jobs_juridico on ia_jobs;
drop policy if exists ia_jobs_parecer on ia_jobs;
create policy ia_jobs_juridico on ia_jobs for all to authenticated using (eh_juridico()) with check (eh_juridico());
create policy ia_jobs_parecer on ia_jobs for select to authenticated using (job_id like 'par-%');

commit;

-- Conferência
select nome, email from usuarios where acesso_juridico order by nome;
select tablename, policyname from pg_policies where tablename in ('processos','andamentos_processos','prazos','acordos_extrajudiciais','documentos',
       'calculos_atualizacao','notificacoes_email','chamados','financeiro','ia_jobs') order by 1, 2;

-- Para desfazer (volta como era): para cada tabela acima,
--   drop policy juridico on <tabela>; create policy "acesso autenticado" on <tabela> for all to authenticated using (true) with check (true);
