-- ═══════════════════════════════════════════════════════════════
-- PRÉ-ANÁLISE DE MATRÍCULA E CERTIDÕES (piloto da Renata, Gestão de Vendas Moema) — 07/10/2026.
-- Escopo e regras: "Piloto — Análise de Certidões e Matrícula (v2)" (21/09) e handover da Renata (06/10).
-- Acesso: só os participantes do piloto (tabela preanalise_acesso) e administradores. A trava é o BANCO (RLS e
-- Storage), não a tela: documentos de vendedores e anuentes são dado pessoal de terceiros.
-- Os PDFs ficam no Storage, bucket privado "preanalise"; as tabelas guardam só o caminho.
-- A análise é feita pela função preanalise-background do site do jurídico (chave da Anthropic e service_role lá).
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════

-- 1) Quem acessa (piloto: os 8 participantes)
create table if not exists preanalise_acesso (email text primary key, incluido_em timestamptz not null default now());
alter table preanalise_acesso enable row level security;
revoke all on preanalise_acesso from anon, authenticated;
insert into preanalise_acesso (email) values
  ('rodrigo@novasaopaulo.com.br'), ('renata@novasaopaulo.com.br'), ('fernanda.araujo@novasaopaulo.com.br'),
  ('anderson.lucchi@novasaopaulo.com.br'), ('cpd@novasaopaulo.com.br'), ('thais.barbosa@novasaopaulo.com.br'),
  ('financeiro@novasaopaulo.com.br'), ('ti@novasaopaulo.com.br')
on conflict (email) do nothing;

create or replace function preanalise_pode() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from preanalise_acesso a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
      or exists (select 1 from usuarios u where u.admin and lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function preanalise_pode() from public, anon;
grant execute on function preanalise_pode() to authenticated;

-- 2) Venda (o que a gerente abre)
create table if not exists preanalise_venda (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null,                    -- endereço ou apelido da venda
  matricula          text,
  cartorio           text,
  sql_contribuinte   text,
  vendedores         text,                             -- nomes como estão na proposta, um por linha (item 4 do checklist)
  area_proposta      text,                             -- área/descrição da proposta (item 11)
  escopo             text not null default 'matricula' check (escopo in ('matricula', 'completo')),
  status             text check (status in ('liberado', 'ressalvas', 'bloqueado', 'incompleto')),
  ultima_analise     timestamptz,
  encaminhado_juridico boolean not null default false,
  encaminhado_em     timestamptz,
  encaminhado_por    text,
  criado_por         text,
  criado_em          timestamptz not null default now()
);

-- 3) Peças documentais (PDFs no Storage)
create table if not exists preanalise_documento (
  id           uuid primary key default gen_random_uuid(),
  venda_id     uuid not null references preanalise_venda(id) on delete cascade,
  tipo         text not null check (tipo in ('matricula', 'certidao', 'iptu', 'outro')),
  nome_arquivo text not null,
  caminho      text not null,                          -- caminho no bucket "preanalise"
  tamanho      integer,
  enviado_por  text,
  enviado_em   timestamptz not null default now()
);
create index if not exists preanalise_documento_venda_ix on preanalise_documento (venda_id);

-- 4) Cada rodada do motor (auditoria: "por que esta venda está com este status?")
create table if not exists preanalise_execucao (
  id           uuid primary key default gen_random_uuid(),
  venda_id     uuid not null references preanalise_venda(id) on delete cascade,
  pedido_por   text,
  iniciado_em  timestamptz not null default now(),
  concluido_em timestamptz,
  situacao     text not null default 'rodando' check (situacao in ('rodando', 'ok', 'erro')),
  erro         text,
  modelo       text,
  config       jsonb,                                  -- regras usadas nesta rodada (validade, lista de certidões, versão)
  documentos   jsonb,                                  -- quais PDFs entraram
  resultado    jsonb,                                  -- dossiê completo
  status       text,
  custo_usd    numeric
);
create index if not exists preanalise_execucao_venda_ix on preanalise_execucao (venda_id, iniciado_em desc);

-- 5) RLS: só quem pode (a função do jurídico grava com service_role)
alter table preanalise_venda enable row level security;
alter table preanalise_documento enable row level security;
alter table preanalise_execucao enable row level security;
revoke all on preanalise_venda, preanalise_documento, preanalise_execucao from anon;
grant select, insert, update, delete on preanalise_venda, preanalise_documento to authenticated;
grant select on preanalise_execucao to authenticated;
drop policy if exists preanalise_venda_piloto on preanalise_venda;
drop policy if exists preanalise_documento_piloto on preanalise_documento;
drop policy if exists preanalise_execucao_piloto on preanalise_execucao;
create policy preanalise_venda_piloto on preanalise_venda for all to authenticated using (preanalise_pode()) with check (preanalise_pode());
create policy preanalise_documento_piloto on preanalise_documento for all to authenticated using (preanalise_pode()) with check (preanalise_pode());
create policy preanalise_execucao_piloto on preanalise_execucao for select to authenticated using (preanalise_pode());

-- 6) Storage: bucket privado, 20 MB por arquivo, só PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('preanalise', 'preanalise', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];
drop policy if exists preanalise_storage_ler on storage.objects;
drop policy if exists preanalise_storage_enviar on storage.objects;
drop policy if exists preanalise_storage_apagar on storage.objects;
create policy preanalise_storage_ler on storage.objects for select to authenticated using (bucket_id = 'preanalise' and public.preanalise_pode());
create policy preanalise_storage_enviar on storage.objects for insert to authenticated with check (bucket_id = 'preanalise' and public.preanalise_pode());
create policy preanalise_storage_apagar on storage.objects for delete to authenticated using (bucket_id = 'preanalise' and public.preanalise_pode());

select 'ok — pré-análise: tabelas, acesso dos 8 do piloto e bucket preanalise' as status;
