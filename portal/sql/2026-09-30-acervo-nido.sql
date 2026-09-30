-- ═══════════════════════════════════════════════════════════════
-- ACERVO NIDO — tabelas só-leitura do backup do NIDO (28/09/2026)
-- GERADO por sandbox/carregar_nido.py --gerar-sql (não editar à mão; mude o mapa lá).
-- Gerado em 2026-09-30. Acesso = mesma regra do Guess (acervo_pode_ler(), guess_acesso).
-- Telefones/e-mails/endereço das pessoas ficam sem grant (só via SQL) até a regra da Fernanda.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;

create table if not exists nido_cargas (
  id bigint generated always as identity primary key, tabela text not null, arquivo text not null,
  linhas integer not null, carregado_em timestamptz not null default now(), observacao text
);

-- Imóveis que passaram pela NSP (NIDO, 2000–2026). chave_pessoa_fj → nido_pessoas.
create table if not exists nido_imoveis (
  chave_imovel             text primary key,
  codigo_anterior          text,
  tipo_imovel              text,
  classificacao            text,
  origem                   text,
  situacao                 text,
  situacao_detalhe         text,
  data_cadastro            date,
  data_atualizacao         date,
  data_ativo               date,
  locado_ate               date,
  cep                      text,
  cidade                   text,
  estado                   text,
  bairro                   text,
  regiao                   text,
  logradouro               text,
  endereco                 text,
  numero                   integer,
  unidade                  text,
  andar                    integer,
  bloco                    text,
  complemento              text,
  zoneamento               text,
  latitude                 numeric(10,6),
  longitude                numeric(10,6),
  edificio                 text,
  condominio               text,
  construtora              text,
  ano_construcao           integer,
  area_total_terreno       numeric(14,2),
  area_util_construida     numeric(14,2),
  dormitorio               integer,
  suite                    integer,
  vaga                     integer,
  banheiro                 integer,
  sala                     integer,
  disponivel_venda         text,
  valor_venda              numeric(14,2),
  disponivel_locacao       text,
  valor_locacao            numeric(14,2),
  valor_condominio         numeric(14,2),
  valor_iptu               numeric(14,2),
  exclusividade            text,
  placa                    text,
  chave_pessoa_fj          text,
  contribuinte             text,
  matricula                text,
  registro                 text
);
comment on table nido_imoveis is 'Imóveis que passaram pela NSP (NIDO, 2000–2026). chave_pessoa_fj → nido_pessoas. Origem: exporta_imovel.';

-- Pessoas referenciadas como proprietário ou proponente (recorte do exporta_pfj). telefones/emails só via SQL (sem grant).
create table if not exists nido_pessoas (
  chave_pessoa_fj          text primary key,
  nome                     text,
  proprietario             text,
  cliente                  text,
  cpf_cnpj                 text,
  cep                      text,
  endereco                 text,
  numero                   integer,
  complemento              text,
  bairro                   text,
  cidade                   text,
  estado                   text,
  profissao                text,
  situacao                 text,
  telefones                text[],
  emails                   text[]
);
comment on table nido_pessoas is 'Pessoas referenciadas como proprietário ou proponente (recorte do exporta_pfj). telefones/emails só via SQL (sem grant). Origem: exporta_pfj.';

-- Propostas (NIDO). chave_imovel → nido_imoveis; chave_pessoa_fj → nido_pessoas.
create table if not exists nido_propostas (
  chave_proposta           text primary key,
  chave_imovel             text,
  chave_pessoa_fj          text,
  chave_fac                text,
  data_cadastro            date,
  tipo_proposta            text,
  tipo_negocio             text,
  valor_proposta           numeric(14,2),
  valor_atual_proposta     numeric(14,2),
  porcentagem_comissao     numeric(14,2),
  valor_comissao           numeric(14,2),
  situacao                 text,
  detalhe_situacao         text,
  data_encerramento        date,
  motivo_recusa            text,
  status_financiamento     text
);
comment on table nido_propostas is 'Propostas (NIDO). chave_imovel → nido_imoveis; chave_pessoa_fj → nido_pessoas. Origem: exporta_proposta.';

-- Negócios fechados (venda/locação). chave_imovel → nido_imoveis; chave_proposta → nido_propostas.
create table if not exists nido_fechamentos (
  chave_fechamento         text primary key,
  chave_imovel             text,
  chave_proposta           text,
  data_cadastro            date,
  data_fechamento          date,
  negocio                  text,
  valor_fechamento         numeric(14,2),
  valor_faturamento        numeric(14,2),
  valor_comissao           numeric(14,2),
  parcelas                 integer,
  obs                      text,
  situacao                 text,
  mes_referencia           text,
  situacao_posvenda        text,
  parceria                 text
);
comment on table nido_fechamentos is 'Negócios fechados (venda/locação). chave_imovel → nido_imoveis; chave_proposta → nido_propostas. Origem: exporta_fechamento.';

-- Corretores/profissionais do NIDO (sem CPF/RG/contato).
create table if not exists nido_corretores (
  chave_profissional       text primary key,
  nome                     text,
  nome_uso                 text,
  equipe                   text,
  tipo_equipe              text,
  chave_agencia            text,
  situacao                 text,
  admissao                 date,
  demissao                 date,
  creci                    text
);
comment on table nido_corretores is 'Corretores/profissionais do NIDO (sem CPF/RG/contato). Origem: exporta_profissional.';

-- Índices
create index if not exists idx_ni_endereco_trgm on nido_imoveis using gin (endereco gin_trgm_ops);
create index if not exists idx_ni_edificio_trgm on nido_imoveis using gin (edificio gin_trgm_ops);
create index if not exists idx_ni_pessoa on nido_imoveis (chave_pessoa_fj);
create index if not exists idx_ni_cep on nido_imoveis (cep);
create index if not exists idx_ni_bairro on nido_imoveis (bairro);
create index if not exists idx_np_nome_trgm on nido_pessoas using gin (nome gin_trgm_ops);
create index if not exists idx_np_doc on nido_pessoas (cpf_cnpj);
create index if not exists idx_npr_imovel on nido_propostas (chave_imovel);
create index if not exists idx_npr_pessoa on nido_propostas (chave_pessoa_fj);
create index if not exists idx_nf_imovel on nido_fechamentos (chave_imovel);
create index if not exists idx_nf_proposta on nido_fechamentos (chave_proposta);

-- RLS: linha só para quem pode ler o acervo (guess_acesso + admins); nenhuma escrita
alter table nido_cargas enable row level security;
drop policy if exists acervo_gerentes on nido_cargas;
create policy acervo_gerentes on nido_cargas for select to authenticated using (true);
alter table nido_imoveis enable row level security;
drop policy if exists acervo_gerentes on nido_imoveis;
create policy acervo_gerentes on nido_imoveis for select to authenticated using (acervo_pode_ler());
alter table nido_pessoas enable row level security;
drop policy if exists acervo_gerentes on nido_pessoas;
create policy acervo_gerentes on nido_pessoas for select to authenticated using (acervo_pode_ler());
alter table nido_propostas enable row level security;
drop policy if exists acervo_gerentes on nido_propostas;
create policy acervo_gerentes on nido_propostas for select to authenticated using (acervo_pode_ler());
alter table nido_fechamentos enable row level security;
drop policy if exists acervo_gerentes on nido_fechamentos;
create policy acervo_gerentes on nido_fechamentos for select to authenticated using (acervo_pode_ler());
alter table nido_corretores enable row level security;
drop policy if exists acervo_gerentes on nido_corretores;
create policy acervo_gerentes on nido_corretores for select to authenticated using (acervo_pode_ler());

-- Colunas liberadas uma a uma
revoke all on nido_cargas, nido_imoveis, nido_pessoas, nido_propostas, nido_fechamentos, nido_corretores from anon, authenticated;
grant select on nido_cargas to authenticated;
grant select (chave_imovel, codigo_anterior, tipo_imovel, classificacao, origem, situacao, situacao_detalhe, data_cadastro, data_atualizacao, data_ativo, locado_ate, cep, cidade, estado, bairro, regiao, logradouro, endereco, numero, unidade, andar, bloco, complemento, zoneamento, latitude, longitude, edificio, condominio, construtora, ano_construcao, area_total_terreno, area_util_construida, dormitorio, suite, vaga, banheiro, sala, disponivel_venda, valor_venda, disponivel_locacao, valor_locacao, valor_condominio, valor_iptu, exclusividade, placa, chave_pessoa_fj, contribuinte, matricula, registro) on nido_imoveis to authenticated;
grant select (chave_pessoa_fj, nome, proprietario, cliente, cpf_cnpj, bairro, cidade, estado, profissao, situacao) on nido_pessoas to authenticated;
grant select (chave_proposta, chave_imovel, chave_pessoa_fj, chave_fac, data_cadastro, tipo_proposta, tipo_negocio, valor_proposta, valor_atual_proposta, porcentagem_comissao, valor_comissao, situacao, detalhe_situacao, data_encerramento, motivo_recusa, status_financiamento) on nido_propostas to authenticated;
grant select (chave_fechamento, chave_imovel, chave_proposta, data_cadastro, data_fechamento, negocio, valor_fechamento, valor_faturamento, valor_comissao, parcelas, obs, situacao, mes_referencia, situacao_posvenda, parceria) on nido_fechamentos to authenticated;
grant select (chave_profissional, nome, nome_uso, equipe, tipo_equipe, chave_agencia, situacao, admissao, demissao, creci) on nido_corretores to authenticated;

-- View de busca: imóvel + nome do proprietário
drop view if exists nido_v_imoveis;
create view nido_v_imoveis with (security_invoker = true) as
select i.chave_imovel, i.tipo_imovel, i.situacao, i.situacao_detalhe, i.data_cadastro, i.data_atualizacao,
       i.cep, i.bairro, i.logradouro, i.endereco, i.numero, i.unidade, i.andar, i.complemento, i.edificio, i.condominio,
       i.area_util_construida, i.dormitorio, i.suite, i.vaga, i.disponivel_venda, i.valor_venda, i.disponivel_locacao, i.valor_locacao,
       i.chave_pessoa_fj, p.nome as proprietario_nome
  from nido_imoveis i left join nido_pessoas p on p.chave_pessoa_fj = i.chave_pessoa_fj;
revoke all on nido_v_imoveis from anon, authenticated;
grant select on nido_v_imoveis to authenticated;

select 'ok — acervo nido: 5 tabelas + nido_cargas + nido_v_imoveis' as status;
-- Rollback: drop view nido_v_imoveis; drop table nido_imoveis, nido_pessoas, nido_propostas, nido_fechamentos, nido_corretores, nido_cargas;
