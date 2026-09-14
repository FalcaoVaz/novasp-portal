-- ─── COLUNAS DE CLIENTE NO PROCESSO ──────────────────────
-- Permite anexar dados do cliente ao processo e marcar se deve receber
-- notificacoes automaticas de andamentos por email.
-- Idempotente: pode rodar varias vezes sem efeito colateral.

alter table public.processos
  add column if not exists cliente_nome      text,
  add column if not exists cliente_email     text,
  add column if not exists notificar_cliente boolean default true;
