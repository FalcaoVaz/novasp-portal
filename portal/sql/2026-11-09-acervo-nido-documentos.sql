-- ═══════════════════════════════════════════════════════════════
-- ACERVO NIDO — DOCUMENTOS (09/11/2026)
-- Anexos do NIDO (autorizações de publicidade, gestão exclusiva, matrículas, capas de IPTU, documentos das propostas…)
-- baixados do backup de 06/11/2026 antes de os links expirarem, guardados no bucket PRIVADO "nido-anexos".
-- Quem vê: a mesma regra do Acervo Nido (nido_pode_ler). Anexos que o NIDO marcava como "protegido": só administradores.
-- O arquivo só abre por link assinado de 5 minutos, pedido pelo portal com o login de quem consulta.
-- Rodar no SQL Editor do banco do portal ANTES da carga (sandbox/../nido-backup/ferramentas/carregar_anexos_nido.py). Pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════

create table if not exists nido_anexos (
  caminho          text primary key,                 -- caminho no bucket nido-anexos (ex.: imoveis/JA39045/123-JA39045001.png)
  origem           text not null check (origem in ('imovel', 'proposta', 'fac', 'empreendimento')),
  chave_imovel     text,                             -- referência do imóvel (também para anexos de proposta)
  chave            text,                             -- chave de origem (imóvel, proposta, atendimento ou empreendimento)
  tipo             text,
  descricao        text,
  nome_arquivo     text,
  data_inclusao    timestamp,
  situacao         text,
  protegido        boolean not null default false,
  tamanho          bigint,
  mime             text,
  carregado_em     timestamptz not null default now()
);
create index if not exists nido_anexos_imovel_ix on nido_anexos (chave_imovel);

create or replace function nido_eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios u where u.admin and coalesce(u.ativo, true) and lower(u.email) = lower(coalesce(auth.jwt()->>'email', '')));
$$;
revoke all on function nido_eh_admin() from public, anon;
grant execute on function nido_eh_admin() to authenticated;

alter table nido_anexos enable row level security;
revoke all on nido_anexos from anon, authenticated;
grant select on nido_anexos to authenticated;
drop policy if exists acervo_nido_anexos on nido_anexos;
create policy acervo_nido_anexos on nido_anexos for select to authenticated
  using (nido_pode_ler() and (not protegido or nido_eh_admin()));

-- bucket privado (sem acesso público); só leitura pelo portal, gravação só pela carga (chave de serviço)
insert into storage.buckets (id, name, public, file_size_limit)
values ('nido-anexos', 'nido-anexos', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists nido_anexos_ler on storage.objects;
create policy nido_anexos_ler on storage.objects for select to authenticated
  using (bucket_id = 'nido-anexos' and nido_pode_ler()
         and exists (select 1 from nido_anexos a where a.caminho = storage.objects.name and (not a.protegido or nido_eh_admin())));

select 'ok — Acervo Nido: tabela nido_anexos e bucket privado nido-anexos' as status;
