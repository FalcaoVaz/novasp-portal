-- ═══════════════════════════════════════════════════════════════
-- ACERVO GUESS (frente 11 do piloto) — tabelas só-leitura do backup do Guess
-- GERADO por sandbox/carregar_guess.py --gerar-sql (não editar à mão; mude o mapa lá).
-- Gerado em 2026-09-29.
--
-- • 4 tabelas prioritárias (ContratosLoc, CadIMovel, Clientes, Inquilinos) com colunas
--   tipadas + `extra jsonb` com as demais colunas não vazias do export.
-- • RLS: SELECT para authenticated; nenhuma escrita pela API (carga só pelo script, via DSN).
-- • Views guess_v_* juntam contrato + imóvel + nomes (security_invoker: RLS vale nelas).
-- • Quem VÊ o módulo é gated na UI (gerentes); a retenção é decisão da Fernanda.
-- Rodar PRIMEIRO no sandbox. Produção: só o Rodrigo.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;

create table if not exists guess_cargas (
  id           bigint generated always as identity primary key,
  tabela       text not null,
  arquivo      text not null,
  linhas       integer not null,
  mascarado    boolean not null,
  carregado_em timestamptz not null default now(),
  observacao   text
);

-- Contratos de locação do Guess (ativos e encerrados; Situacao distingue). Imovel → guess_imoveis.imovel; Proprietario → guess_clientes.codigo; Inquilino/2/3 → guess_inquilinos.codigo.
create table if not exists guess_contratos (
  contrato                 integer primary key,
  imovel                   integer,
  proprietario             integer,
  inquilino                integer,
  inquilino2               integer,
  inquilino3               integer,
  fiador                   integer,
  fiador2                  integer,
  fiador3                  integer,
  fiador4                  integer,
  data_contrato            date,
  prim_vencto              date,
  dia_vencto               integer,
  periodo_contrato         integer,
  val_contrato             numeric(14,2),
  administracao_per        numeric(14,2),
  administracao_val        numeric(14,2),
  intermediacao_per        numeric(14,2),
  intermediacao_val        numeric(14,2),
  vigencia_de              date,
  vigencia_ate             date,
  reajuste                 text,
  tipo_indice              integer,
  situacao                 text,
  situacao_j               text,
  tipo_contrato            integer,
  tipo_mod_contrato        text,
  tipo_fianca              text,
  garantido                text,
  seguro_fianca            text,
  cod_seguradora           integer,
  valor_caucao             numeric(14,2),
  data_rescisao            date,
  usuario_rescisao         text,
  hora_rescisao            time,
  prox_reajuste            date,
  prox_renovacao           date,
  ult_renovacao            date,
  n_renovacao              integer,
  n_meses                  integer,
  usuario_criacao          text,
  data_criacao             date,
  hora_criacao             time,
  observacao               text,
  cob_endereco             text,
  cob_bairro               text,
  cob_cep                  text,
  cob_cidade               text,
  cob_estado               text,
  cob_complemento          text,
  ctrl_pasta               text,
  multa                    integer,
  juros                    integer,
  mes_adm                  integer,
  carencia                 integer,
  declara_irrf             text,
  extra                    jsonb
);
comment on table guess_contratos is 'Contratos de locação do Guess (ativos e encerrados; Situacao distingue). Imovel → guess_imoveis.imovel; Proprietario → guess_clientes.codigo; Inquilino/2/3 → guess_inquilinos.codigo. Origem: ContratosLoc.xlsx.';

-- Ficha do imóvel (CadIMovel). No Guess a chave se chama "Contrato"; aqui é imovel.
create table if not exists guess_imoveis (
  imovel                   integer primary key,
  proprietario             integer,
  endereco                 text,
  bairro                   text,
  cidade                   text,
  estado                   text,
  cep                      text,
  complemento              text,
  pasta                    integer,
  iptu_lote                text,
  situacao                 text,
  acerto                   text,
  perc_part_prop           integer,
  administracao            integer,
  contrato_ref             integer,
  condominio               integer,
  codigo_cidade_dimob      text,
  tipo_imovel_dimob        text,
  daem_n_contrib           text,
  numero_de_pessoas        integer,
  nro_registro_imovel      text,
  nro_reg_matric_imovel    text,
  gas_encanado             text,
  n_cadastro               text,
  extrato_inteiro          text,
  competencia_condominio   text,
  luz_uc                   text,
  extra                    jsonb
);
comment on table guess_imoveis is 'Ficha do imóvel (CadIMovel). No Guess a chave se chama "Contrato"; aqui é imovel. Origem: Cadmovel.xlsx.';

-- Proprietários/clientes (Clientes).
create table if not exists guess_clientes (
  codigo                   integer primary key,
  nome                     text,
  fantasia                 text,
  tipo_endereco            text,
  endereco                 text,
  numero                   text,
  complemento              text,
  bairro                   text,
  cidade                   text,
  estado                   text,
  cep                      text,
  telefone                 text,
  fax                      text,
  email                    text,
  cpf_cnpj                 text,
  rg_ie                    text,
  contato                  text,
  observacao               text,
  cadastro                 date,
  ultima_atividade         date,
  categoria                text,
  estado_civil             text,
  profissao                text,
  nacionalidade            text,
  situacao                 text,
  data_ult_alteracao       date,
  usuario_alterou          text,
  sexo                     text,
  conjuge                  text,
  declara_irrf             text,
  prop_estrangeiro         text,
  prop_residente_fora      text,
  extra                    jsonb
);
comment on table guess_clientes is 'Proprietários/clientes (Clientes). Origem: Clientes.xlsx.';

-- Inquilinos (maior cadastro de pessoas do Guess).
create table if not exists guess_inquilinos (
  codigo                   integer primary key,
  nome                     text,
  fantasia                 text,
  tipo_endereco            text,
  endereco                 text,
  numero                   text,
  complemento              text,
  bairro                   text,
  cidade                   text,
  estado                   text,
  cep                      text,
  telefone                 text,
  fax                      text,
  email                    text,
  cpf_cnpj                 text,
  rg_ie                    text,
  contato                  text,
  observacao               text,
  cadastro                 date,
  ultima_atividade         date,
  categoria                text,
  estado_civil             text,
  profissao                text,
  nacionalidade            text,
  situacao                 text,
  data_ult_alteracao       date,
  usuario_alterou          text,
  sexo                     text,
  conjuge                  text,
  renda_mensal             numeric(14,2),
  selecionado              text,
  extra                    jsonb
);
comment on table guess_inquilinos is 'Inquilinos (maior cadastro de pessoas do Guess). Origem: Inquilinos.xlsx.';

-- Índices de consulta
create index if not exists idx_gc_imovel       on guess_contratos (imovel);
create index if not exists idx_gc_proprietario on guess_contratos (proprietario);
create index if not exists idx_gc_inquilino    on guess_contratos (inquilino);
create index if not exists idx_gc_situacao     on guess_contratos (situacao);
create index if not exists idx_gc_vig_ate      on guess_contratos (vigencia_ate);
create index if not exists idx_gi_proprietario on guess_imoveis (proprietario);
create index if not exists idx_gi_endereco_trgm on guess_imoveis using gin (endereco gin_trgm_ops);
create index if not exists idx_gcl_nome_trgm    on guess_clientes using gin (nome gin_trgm_ops);
create index if not exists idx_gin_nome_trgm    on guess_inquilinos using gin (nome gin_trgm_ops);
create index if not exists idx_gcl_doc          on guess_clientes (cpf_cnpj);
create index if not exists idx_gin_doc          on guess_inquilinos (cpf_cnpj);

-- RLS: só leitura para usuário logado; sem insert/update/delete pela API
alter table guess_cargas enable row level security;
drop policy if exists leitura_autenticada on guess_cargas;
create policy leitura_autenticada on guess_cargas for select to authenticated using (true);
alter table guess_contratos enable row level security;
drop policy if exists leitura_autenticada on guess_contratos;
create policy leitura_autenticada on guess_contratos for select to authenticated using (true);
alter table guess_imoveis enable row level security;
drop policy if exists leitura_autenticada on guess_imoveis;
create policy leitura_autenticada on guess_imoveis for select to authenticated using (true);
alter table guess_clientes enable row level security;
drop policy if exists leitura_autenticada on guess_clientes;
create policy leitura_autenticada on guess_clientes for select to authenticated using (true);
alter table guess_inquilinos enable row level security;
drop policy if exists leitura_autenticada on guess_inquilinos;
create policy leitura_autenticada on guess_inquilinos for select to authenticated using (true);

-- View de consulta: contrato + imóvel + nomes
create or replace view guess_v_contratos with (security_invoker = true) as
select c.contrato, c.situacao, c.situacao_j, c.data_contrato, c.vigencia_de, c.vigencia_ate, c.data_rescisao,
       c.val_contrato, c.tipo_contrato, c.tipo_fianca, c.periodo_contrato, c.dia_vencto,
       c.imovel, i.endereco, i.complemento, i.bairro, i.cidade, i.cep, i.situacao as situacao_imovel,
       c.proprietario, p.nome as proprietario_nome, c.inquilino, q.nome as inquilino_nome,
       c.inquilino2, q2.nome as inquilino2_nome, c.fiador, c.usuario_criacao, c.data_criacao
  from guess_contratos c
  left join guess_imoveis    i  on i.imovel  = c.imovel
  left join guess_clientes   p  on p.codigo  = c.proprietario
  left join guess_inquilinos q  on q.codigo  = c.inquilino
  left join guess_inquilinos q2 on q2.codigo = c.inquilino2;

select 'ok — acervo guess: 4 tabelas + guess_cargas + guess_v_contratos' as status;

-- Rollback: drop view guess_v_contratos; drop table guess_contratos, guess_imoveis, guess_clientes, guess_inquilinos, guess_cargas;
