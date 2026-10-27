-- ═══════════════════════════════════════════════════════════════
-- ACERVO NIDO: CAPTADORES dos imóveis (Rodrigo, 27/10/2026)
-- No Nido o captador é o "ANGARIADOR" (exporta_imovel_profissional). Fica numa tabela pequena à parte (≈ 6 MB),
-- e NÃO numa coluna nova de nido_imoveis: atualizar os 127 mil imóveis duplicaria a tabela (65 MB) e o banco
-- passaria de 500 MB (plano gratuito trava em leitura).
-- Carga: sandbox/carregar_nido_captadores.py (lê o backup do Nido; só o Rodrigo roda, com o DSN).
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
begin;

create table if not exists nido_captadores (
  chave_imovel text primary key,
  captadores   text not null,              -- "Nome (equipe) · Nome (equipe)", na ordem do Nido
  chaves       text[] not null default '{}' -- chave_profissional de cada captador (para cruzar com nido_corretores)
);
alter table nido_captadores enable row level security;
revoke all on nido_captadores from anon, authenticated;
grant select on nido_captadores to authenticated;
drop policy if exists acervo_nido on nido_captadores;
-- mesma regra das tabelas do Nido (nido_pode_ler, de 2026-10-22; se ainda não rodou aquele SQL, cai na regra antiga)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'nido_pode_ler') then
    execute 'create policy acervo_nido on nido_captadores for select to authenticated using (nido_pode_ler())';
  else
    execute 'create policy acervo_nido on nido_captadores for select to authenticated using (acervo_pode_ler())';
  end if;
end $$;

-- view de busca: + captadores (coluna nova no fim, para o "create or replace" aceitar)
create or replace view nido_v_imoveis with (security_invoker = true) as
select i.chave_imovel, i.tipo_imovel, i.situacao, i.situacao_detalhe, i.data_cadastro, i.data_atualizacao,
       i.cep, i.bairro, i.logradouro, i.endereco, i.numero, i.unidade, i.andar, i.complemento, i.edificio, i.condominio,
       i.area_util_construida, i.dormitorio, i.suite, i.vaga, i.disponivel_venda, i.valor_venda, i.disponivel_locacao, i.valor_locacao,
       i.chave_pessoa_fj, p.nome as proprietario_nome, c.captadores
  from nido_imoveis i
  left join nido_pessoas p on p.chave_pessoa_fj = i.chave_pessoa_fj
  left join nido_captadores c on c.chave_imovel = i.chave_imovel;
revoke all on nido_v_imoveis from anon, authenticated;
grant select on nido_v_imoveis to authenticated;

commit;

select 'ok — nido_captadores (carregue com sandbox/carregar_nido_captadores.py)' as status;
