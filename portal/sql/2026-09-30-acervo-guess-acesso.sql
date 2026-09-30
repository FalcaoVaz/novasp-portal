-- ═══════════════════════════════════════════════════════════════
-- ACERVO GUESS — acesso por gerente + colunas liberadas uma a uma (pedido v2 do Fabio, 29/09/2026)
-- Aplica no banco as regras do pedido: (1) só gerentes leem as linhas; (2) a API só enxerga as
-- colunas que a tela usa — valores/cálculos do contrato, renda, cônjuge, telefone, e-mail, banco,
-- referências e o `extra` ficam FORA até a regra de retenção da Fernanda; (3) nenhuma escrita.
-- Adaptado ao portal real: o GoTrue não guarda usuarios.id, mas o e-mail do JWT é o mesmo de
-- usuarios.email (00-config.js _authEmailDe) → a checagem é por e-mail, numa lista (guess_acesso)
-- + admins. Aplicado em produção em 30/09/2026.
-- ═══════════════════════════════════════════════════════════════

-- 1) Quem pode ler: lista de e-mails (gerentes) + admins da tabela usuarios
create table if not exists guess_acesso (
  email     text primary key,
  nome      text,
  criado_em timestamptz not null default now()
);
alter table guess_acesso enable row level security;          -- sem policy = ninguém lê pela API
revoke all on guess_acesso from anon, authenticated;

create or replace function acervo_pode_ler() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guess_acesso a
                  where a.email = lower(coalesce(auth.jwt()->>'email', '')))
      or exists (select 1 from usuarios u
                  where u.admin and coalesce(u.ativo, true)
                    and lower(u.email) = lower(coalesce(auth.jwt()->>'email', '')));
$$;
revoke all on function acervo_pode_ler() from public, anon;
grant execute on function acervo_pode_ler() to authenticated;

-- Semente: gerentes (LIDERES_GESTAO do portal, sem marketing/consultor externo) + T.I. + jurídico (retenção)
insert into guess_acesso (email, nome)
select lower(email), nome from usuarios
 where lower(email) in (
   'rodrigo@novasaopaulo.com.br',            -- Rodrigo (admin)
   'renata@novasaopaulo.com.br',             -- Renata — Superintendência / Moema
   'felippe.lemos@novasaopaulo.com.br',      -- Felippe — Vendas
   'gerenciavendas@novasaopaulo.com.br',     -- Christiane — Vendas
   'emilia.vitoria@novasaopaulo.com.br',     -- Emilia — Vendas
   'joao@novasaopaulo.com.br',               -- João Marcos — Administração
   'vivian@novasaopaulo.com.br',             -- Vivian — Locação
   'leandro.nogueira@novasaopaulo.com.br',   -- Leandro Nogueira — Administrativo
   'ti@novasaopaulo.com.br',                 -- Fabio — T.I. (dono da frente)
   'fernanda.araujo@novasaopaulo.com.br'     -- Fernanda — Jurídico (retenção)
 )
on conflict (email) do nothing;

-- 2) Políticas: linha só aparece para quem pode ler; nenhuma política de escrita
do $$ declare t text; begin
  foreach t in array array['guess_contratos','guess_imoveis','guess_clientes','guess_inquilinos'] loop
    execute format('drop policy if exists leitura_autenticada on %I', t);
    execute format('drop policy if exists acervo_gerentes on %I', t);
    execute format('create policy acervo_gerentes on %I for select to authenticated using (acervo_pode_ler())', t);
  end loop;
end $$;

-- 3) Colunas liberadas uma a uma (o resto some da API, inclusive `extra`)
revoke all on guess_contratos, guess_imoveis, guess_clientes, guess_inquilinos, guess_cargas from anon, authenticated;
grant select on guess_cargas to authenticated;
grant select (contrato, imovel, proprietario, inquilino, inquilino2, inquilino3, fiador, fiador2, fiador3, fiador4,
              situacao, situacao_j, data_contrato, vigencia_de, vigencia_ate, data_rescisao, usuario_rescisao, hora_rescisao,
              ctrl_pasta, tipo_contrato, tipo_mod_contrato, periodo_contrato, dia_vencto, prim_vencto, reajuste, tipo_indice,
              prox_reajuste, prox_renovacao, ult_renovacao, n_renovacao, n_meses, garantido, tipo_fianca, seguro_fianca,
              cod_seguradora, data_criacao, hora_criacao, usuario_criacao, carencia)
  on guess_contratos to authenticated;
-- Se a Fernanda liberar valores: acrescentar val_contrato aqui, na view e na tela (19-acervo-guess.js).
grant select (imovel, proprietario, endereco, complemento, bairro, cidade, estado, cep, pasta, situacao, iptu_lote,
              n_cadastro, nro_registro_imovel, nro_reg_matric_imovel, administracao, contrato_ref)
  on guess_imoveis to authenticated;
grant select (codigo, nome, fantasia, cpf_cnpj, bairro, cidade, categoria, situacao) on guess_clientes   to authenticated;
grant select (codigo, nome, fantasia, cpf_cnpj, bairro, cidade, categoria, situacao) on guess_inquilinos to authenticated;

-- 4) View sem valores (security_invoker: RLS e grants de coluna valem nela)
drop view if exists guess_v_contratos;
create view guess_v_contratos with (security_invoker = true) as
select c.contrato, c.situacao, c.situacao_j, c.data_contrato, c.vigencia_de, c.vigencia_ate, c.data_rescisao,
       c.tipo_contrato, c.tipo_fianca, c.periodo_contrato, c.dia_vencto,
       c.imovel, i.endereco, i.complemento, i.bairro, i.cidade, i.cep, i.situacao as situacao_imovel,
       c.proprietario, p.nome as proprietario_nome, c.inquilino, q.nome as inquilino_nome,
       c.inquilino2, q2.nome as inquilino2_nome, c.fiador, c.usuario_criacao, c.data_criacao
  from guess_contratos c
  left join guess_imoveis    i  on i.imovel  = c.imovel
  left join guess_clientes   p  on p.codigo  = c.proprietario
  left join guess_inquilinos q  on q.codigo  = c.inquilino
  left join guess_inquilinos q2 on q2.codigo = c.inquilino2;
revoke all on guess_v_contratos from anon, authenticated;
grant select on guess_v_contratos to authenticated;

select 'ok — acervo: acesso por gerente (' || (select count(*) from guess_acesso) || ' e-mails) + colunas liberadas' as status;
-- Gerir acesso: insert into guess_acesso(email,nome) values ('x@novasaopaulo.com.br','Nome'); / delete from guess_acesso where email='...';
