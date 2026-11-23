-- 23/11/2026 — ENTREGA DE CHAVES sai da planilha (Apps Script) e vem para o banco (etapa 3 da saída do Apps Script).
-- Problemas do módulo antigo: painel e planilha públicos (sem login; nomes/e-mails expostos e etapas alteráveis por qualquer um),
-- sem histórico, sem responsável, sem prazos e sem nenhum aviso quando uma rescisão não vira processo.
-- Novo: processos + andamentos no banco (portal js/29-entrega-chaves.js), cópia leve dos contratos/pessoas do Imoview para
-- preencher o cadastro pelo código do contrato e listar "rescisões sem processo", consulta pública só pelo protocolo
-- (função falcaovaz chaves-consulta, sem nomes nem e-mails) e resumo diário para o gestor (função chaves-resumo).
-- Depois de rodar: sandbox/sync_imoview_cache.py --gravar e sandbox/migrar_entrega_chaves.py --gravar (Rodrigo).

-- ── processos ──────────────────────────────────────────────────
create table if not exists chaves_processos (
  protocolo          text primary key,
  data_cadastro      date not null default current_date,
  contrato_imoview   integer,                       -- código do contrato no Imoview (quando conhecido)
  codigo_guess       text not null default '',
  locador            text not null default '',
  email_locador      text not null default '',      -- pode ter mais de um, separados por vírgula
  locatario          text not null default '',
  email_locatario    text not null default '',
  endereco           text not null default '',
  tipo_fianca        text not null default '',      -- Caução | Seguro fiança | Fiador | Título de capitalização | Sem garantia
  responsavel        text not null default '',      -- quem cuida do processo
  status             text not null default 'Entrega de chaves agendada',
  data_agendada      date, data_entrega date, data_vistoria date, data_liberacao date,
  data_debitos       date, data_devolucao date, data_resgate date, data_sinistro date,
  necessita_reparo   text not null default '',
  descricao_reparo   text not null default '',
  valor_reparo       text not null default '',
  responsavel_reparo text not null default '',
  observacoes        text not null default '',
  cancelado          boolean not null default false,
  motivo_cancelamento text not null default '',
  criado_por         text not null default '',
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists chaves_processos_contrato on chaves_processos (contrato_imoview);

create table if not exists chaves_andamentos (
  id         bigint generated always as identity primary key,
  protocolo  text not null references chaves_processos(protocolo) on delete cascade,
  em         timestamptz not null default now(),
  etapa      text not null default '',
  mensagem   text not null default '',
  autor      text not null default '',
  notificou  boolean not null default false
);
create index if not exists chaves_andamentos_proto on chaves_andamentos (protocolo, em);

drop trigger if exists trg_atualizado on chaves_processos;
create trigger trg_atualizado before update on chaves_processos for each row execute function calendar_toca_atualizado();

-- ── cópia leve do Imoview (atualizada pela função imoview-sync de hora em hora) ─────
create table if not exists imoview_contratos (
  codigo            integer primary key,
  codigo_auxiliar   text not null default '',
  situacao          text not null default '',
  locatario_codigo  integer,
  locatario_nome    text not null default '',
  locatario_email   text not null default '',
  endereco          text not null default '',
  garantia          text not null default '',
  locadores         jsonb not null default '[]',      -- [{codigo, nome}]
  data_inicio       date, data_aviso_desocupacao date, data_previsao_rescisao date, data_rescisao date,
  motivo_rescisao   text not null default '',
  atualizado_em     timestamptz not null default now()
);
create index if not exists imoview_contratos_rescisao on imoview_contratos (data_rescisao);
create index if not exists imoview_contratos_aux on imoview_contratos (codigo_auxiliar);

create table if not exists imoview_pessoas (
  codigo        integer primary key,
  nome          text not null default '',
  emails        text not null default '',              -- separados por vírgula
  atualizado_em timestamptz not null default now()
);

create table if not exists imoview_sync_estado (
  chave    text primary key,                            -- 'contratos' | 'pessoas'
  ultimo   timestamptz not null                         -- última sincronização completa até aqui
);

-- ── acesso: equipe do portal (menos corretor do site); nada para anônimo ─────
alter table chaves_processos   enable row level security;
alter table chaves_andamentos  enable row level security;
alter table imoview_contratos  enable row level security;
alter table imoview_pessoas    enable row level security;
alter table imoview_sync_estado enable row level security;
revoke all on chaves_processos, chaves_andamentos, imoview_contratos, imoview_pessoas, imoview_sync_estado from anon;
drop policy if exists "acesso autenticado" on chaves_processos;
create policy "acesso autenticado" on chaves_processos for all to authenticated using (not eh_corretor_site()) with check (not eh_corretor_site());
drop policy if exists "acesso autenticado" on chaves_andamentos;
create policy "acesso autenticado" on chaves_andamentos for all to authenticated using (not eh_corretor_site()) with check (not eh_corretor_site());
drop policy if exists "leitura equipe" on imoview_contratos;
create policy "leitura equipe" on imoview_contratos for select to authenticated using (not eh_corretor_site());
drop policy if exists "leitura equipe" on imoview_pessoas;
create policy "leitura equipe" on imoview_pessoas for select to authenticated using (not eh_corretor_site());
grant select, insert, update on chaves_processos to authenticated;
grant select, insert on chaves_andamentos to authenticated;
grant select on imoview_contratos, imoview_pessoas to authenticated;
-- imoview_* e imoview_sync_estado: gravação só pela chave de serviço (sincronização)

drop trigger if exists trg_auditoria on chaves_processos;
create trigger trg_auditoria after insert or update or delete on chaves_processos for each row execute function auditoria_trigger();

select 'chaves_processos' as tabela, count(*) from chaves_processos
union all select 'chaves_andamentos', count(*) from chaves_andamentos
union all select 'imoview_contratos', count(*) from imoview_contratos
union all select 'imoview_pessoas', count(*) from imoview_pessoas;
