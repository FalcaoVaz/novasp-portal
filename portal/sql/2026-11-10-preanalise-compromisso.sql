-- ═══════════════════════════════════════════════════════════════
-- PRÉ-ANÁLISE — compromisso de venda e compra (pacote da Renata de 09/11/2026), 10/11/2026
--   1) preanalise_venda.minuta: dados do compromisso (negociação, vendedores e compradores qualificados, proposta lida,
--      última emissão). Um JSON por venda, gravado pela tela (js/26-preanalise-compromisso.js).
--   2) preanalise_anexo: anexos que NÃO entram na leitura das certidões — proposta de compra (Word/PDF), documentos
--      pessoais (PDF/JPG/PNG, de quem é) e o compromisso emitido (Word e PDF). Matrícula e IPTU continuam em
--      preanalise_documento (entram na análise).
--   3) preanalise_config: padrões da pré-análise (ex.: testemunhas do compromisso), gravados pela tela.
--   4) bucket "preanalise" passa a aceitar Word (.docx).
-- Mesma regra de acesso das outras tabelas da pré-análise: preanalise_pode(). Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════

-- 1) dados do compromisso
alter table preanalise_venda add column if not exists minuta jsonb not null default '{}'::jsonb;

-- 2) anexos fora da análise
create table if not exists preanalise_anexo (
  id           uuid primary key default gen_random_uuid(),
  venda_id     uuid not null references preanalise_venda(id) on delete cascade,
  slot         text not null check (slot in ('proposta', 'pessoal', 'compromisso')),
  pessoa       text,                              -- documentos pessoais: de quem é (nome como na venda)
  nome_arquivo text not null,
  caminho      text not null,                     -- caminho no bucket "preanalise" (sem nome de pessoa)
  tamanho      integer,
  mime         text,
  enviado_por  text,
  enviado_em   timestamptz not null default now()
);
create index if not exists preanalise_anexo_venda_ix on preanalise_anexo (venda_id, slot);

-- 3) padrões
create table if not exists preanalise_config (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['preanalise_anexo', 'preanalise_config'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop policy if exists piloto on %I', t);
    execute format('create policy piloto on %I for all to authenticated using (preanalise_pode()) with check (preanalise_pode())', t);
  end loop;
end $$;

-- 4) Word no bucket (proposta em .docx e o compromisso emitido)
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] where id = 'preanalise';

-- auditoria (mesma função das outras tabelas)
do $$ begin
  if exists (select 1 from pg_proc where proname = 'auditoria_trigger') then
    drop trigger if exists trg_auditoria on preanalise_anexo;
    create trigger trg_auditoria after insert or update or delete on preanalise_anexo for each row execute function auditoria_trigger();
  end if;
end $$;

select 'ok — pré-análise: dados do compromisso, anexos (proposta, documentos pessoais, compromisso), padrões e Word no bucket' as status;
