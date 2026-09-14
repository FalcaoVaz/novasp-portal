-- ─── NOTIFICAÇÕES DE FALHA DE EMAIL ──────────────────────
-- Registra bounces (emails não entregues) que o GAS sweeper captura
-- da caixa de entrada do owner do script. Cada bounce é amarrado, quando
-- possível, ao registro de origem (processo, requisição, entrega de chaves,
-- manutenção, etc).

create table if not exists public.notificacoes_falha (
  id                    uuid primary key default gen_random_uuid(),
  -- Quem deveria receber e falhou
  email_destinatario    text not null,
  -- 'address_not_found' | 'inbox_full' | 'blocked_dkim' | 'unauthenticated' | 'mailbox_disabled' | 'other'
  tipo_erro             text,
  -- Mensagem técnica do servidor remoto (550, 552, etc)
  mensagem_erro         text,
  -- Sistema que tentou enviar: 'juridico-tjsp' | 'requisicao' | 'manutencao' | 'entrega-chaves' | 'gestao' | 'desconhecido'
  origem_sistema        text,
  -- ID / protocolo do registro de origem, quando identificável
  origem_protocolo      text,
  -- Nome / identificação de quem cadastrou o email errado (se identificável)
  cadastrado_por_nome   text,
  cadastrado_por_id     uuid references public.usuarios(id) on delete set null,
  -- Data em que o bounce foi recebido / processado
  recebido_em           timestamptz default now(),
  processado_em         timestamptz default now(),
  -- Hash do Message-ID do bounce — evita inserir duplicado se o sweeper rodar 2x
  hash_bounce           text unique,
  -- Status do tratamento humano
  status                text default 'aberto' check (status in ('aberto','lido','resolvido','ignorado')),
  resolvido_em          timestamptz,
  resolvido_por         uuid references public.usuarios(id),
  observacoes           text,
  criado_em             timestamptz default now()
);

create index if not exists idx_notif_falha_status   on public.notificacoes_falha (status);
create index if not exists idx_notif_falha_origem   on public.notificacoes_falha (origem_sistema);
create index if not exists idx_notif_falha_quem     on public.notificacoes_falha (cadastrado_por_id);
create index if not exists idx_notif_falha_recebido on public.notificacoes_falha (recebido_em desc);

alter table public.notificacoes_falha enable row level security;
drop policy if exists "notif_falha_full_anon" on public.notificacoes_falha;
create policy "notif_falha_full_anon"
  on public.notificacoes_falha
  for all
  using (true)
  with check (true);
