-- ═══════════════════════════════════════════════════════════════
-- PRÉ-ANÁLISE — acompanhamento da venda (06/11/2026), trazido do programa local da Renata (versão de 06/11):
-- andamento por etapas e marcos, compradores e versão do contrato, protocolos/autorizações/notificações/recibos
-- numerados (NSP-AAAA-NNNN), pós-venda, arquivamento e linha do tempo.
-- Rodar no SQL Editor do mesmo banco do SQL de 04/11 (2026-11-04-preanalise-painel.sql). Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════

-- 1) Venda: quem compra, versão do contrato, etapas (status fixado à mão), marcos, pós-venda e arquivamento
alter table preanalise_venda add column if not exists compradores     text;                         -- um por linha
alter table preanalise_venda add column if not exists versao_contrato text;                         -- '1'..'4' (modelos da NSP)
alter table preanalise_venda add column if not exists etapas          jsonb not null default '{}'::jsonb;  -- {tarefa: {status, resp, prazo, nota}}
alter table preanalise_venda add column if not exists marcos          jsonb not null default '{}'::jsonb;  -- {inicio, contrato_assinado, ...: 'AAAA-MM-DD'}
alter table preanalise_venda add column if not exists pos_venda       jsonb not null default '{}'::jsonb;  -- {contas[], condominio{}, recibos[], anexos[]}
alter table preanalise_venda add column if not exists arquivada_em    timestamptz;
alter table preanalise_venda add column if not exists arquivada_por   text;
alter table preanalise_venda add column if not exists arquivada_nota  text;
alter table preanalise_venda add column if not exists arquivada_com_pendencias boolean;
alter table preanalise_venda drop constraint if exists preanalise_venda_versao_contrato_check;
alter table preanalise_venda add constraint preanalise_venda_versao_contrato_check check (versao_contrato is null or versao_contrato in ('1', '2', '3', '4'));

-- 2) Protocolos, autorizações, notificações extrajudiciais e recibos de comissão
create table if not exists preanalise_protocolo (
  id           uuid primary key default gen_random_uuid(),
  venda_id     uuid not null references preanalise_venda(id) on delete cascade,
  numero       text unique,                            -- NSP-AAAA-NNNN, dado pelo banco
  tipo         text not null check (tipo in ('chaves', 'documentos', 'escritura', 'autorizacao', 'notificacao', 'recibo')),
  status       text not null default 'emitido' check (status in ('emitido', 'assinado', 'enviado', 'recebido', 'cumprido', 'descumprido', 'cancelado')),
  data_doc     date not null default (now() at time zone 'America/Sao_Paulo')::date,
  de           text,                                   -- entregue por / autorizante / notificante / quem paga
  para         text,                                   -- recebido por / autorizado / notificado / beneficiário
  descricao    text,                                   -- itens / objeto / obrigação
  observacoes  text,
  prazo_dias   integer,                                -- notificação
  recebido_em  date,                                   -- notificação: o prazo conta daqui
  valor        numeric,                                -- recibo
  anexos       jsonb not null default '[]'::jsonb,     -- [{nome, caminho, em, por}] no bucket "preanalise"
  criado_por   text,
  criado_em    timestamptz not null default now()
);
create index if not exists preanalise_protocolo_venda_ix on preanalise_protocolo (venda_id);

create or replace function preanalise_protocolo_numero() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY'); n integer;
begin
  perform pg_advisory_xact_lock(hashtext('preanalise_protocolo_' || a));
  select coalesce(max(split_part(numero, '-', 3)::integer), 0) + 1 into n from preanalise_protocolo where numero like 'NSP-' || a || '-%';
  new.numero := 'NSP-' || a || '-' || lpad(n::text, 4, '0');
  return new;
end $$;
drop trigger if exists trg_preanalise_protocolo_numero on preanalise_protocolo;
create trigger trg_preanalise_protocolo_numero before insert on preanalise_protocolo for each row execute function preanalise_protocolo_numero();
create or replace function preanalise_protocolo_numero_fixo() returns trigger language plpgsql as $$
begin new.numero := old.numero; new.venda_id := old.venda_id; return new; end $$;
drop trigger if exists trg_preanalise_protocolo_numero_fixo on preanalise_protocolo;
create trigger trg_preanalise_protocolo_numero_fixo before update on preanalise_protocolo for each row execute function preanalise_protocolo_numero_fixo();

-- 3) Linha do tempo: o que não fica em outra coluna (etapas, marcos, protocolos, pós-venda, arquivamento)
create table if not exists preanalise_evento (
  id        bigint generated always as identity primary key,
  venda_id  uuid not null references preanalise_venda(id) on delete cascade,
  quando    timestamptz not null default now(),
  por       text,
  acao      text not null,
  detalhe   text
);
create index if not exists preanalise_evento_venda_ix on preanalise_evento (venda_id, quando desc);

-- 4) RLS: só o piloto (mesma regra das outras tabelas). Evento só se lê e acrescenta.
alter table preanalise_protocolo enable row level security;
alter table preanalise_evento enable row level security;
revoke all on preanalise_protocolo, preanalise_evento from anon;
grant select, insert, update, delete on preanalise_protocolo to authenticated;
grant select, insert on preanalise_evento to authenticated;
drop policy if exists preanalise_protocolo_piloto on preanalise_protocolo;
create policy preanalise_protocolo_piloto on preanalise_protocolo for all to authenticated using (preanalise_pode()) with check (preanalise_pode());
drop policy if exists preanalise_evento_ler on preanalise_evento;
drop policy if exists preanalise_evento_incluir on preanalise_evento;
create policy preanalise_evento_ler on preanalise_evento for select to authenticated using (preanalise_pode());
create policy preanalise_evento_incluir on preanalise_evento for insert to authenticated with check (preanalise_pode());

-- 5) Anexos de protocolos e do pós-venda: PDF, JPG e PNG (protocolo assinado, AR, conta, comprovante)
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'] where id = 'preanalise';

-- 6) Auditoria
drop trigger if exists trg_auditoria on preanalise_protocolo;
create trigger trg_auditoria after insert or update or delete on preanalise_protocolo for each row execute function auditoria_trigger();

select 'ok — pré-análise: etapas, marcos, protocolos, pós-venda, arquivamento e linha do tempo' as status;
