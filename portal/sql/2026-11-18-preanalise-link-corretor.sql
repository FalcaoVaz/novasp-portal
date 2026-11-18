-- 18/11/2026 — link de acompanhamento da venda para o corretor (pacote da Renata, motor 1.3).
-- A página pública (falcaovaz.netlify.app/acompanhar/<token>) mostra só o "snapshot": etapas, tarefas, marcos e próximos
-- prazos — sem CPF, RG, valores, certidões ou dados de clientes. O portal atualiza o snapshot quando a equipe abre a venda.
-- Token aleatório (UUID v4). Desativar = ativo false (a página passa a dar "link desativado").
-- Gerente, assistente e admin criam/desativam pelo portal (mesma regra da pré-análise: preanalise_pode()).
-- A função pública lê com a chave de serviço, só pelo token ativo. Pode rodar de novo sem erro.
create table if not exists preanalise_link_corretor (
  token          text primary key check (token ~ '^[0-9a-f-]{36}$'),
  venda_id       uuid not null references preanalise_venda(id) on delete cascade,
  ativo          boolean not null default true,
  criado_por     text,
  criado_em      timestamptz not null default now(),
  desativado_por text,
  desativado_em  timestamptz,
  snapshot       jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);
create index if not exists preanalise_link_corretor_venda on preanalise_link_corretor (venda_id);
alter table preanalise_link_corretor enable row level security;
drop policy if exists piloto on preanalise_link_corretor;
create policy piloto on preanalise_link_corretor for all to authenticated using (preanalise_pode()) with check (preanalise_pode());
grant select, insert, update on preanalise_link_corretor to authenticated;
drop trigger if exists trg_auditoria on preanalise_link_corretor;
create trigger trg_auditoria after insert or update or delete on preanalise_link_corretor for each row execute function auditoria_trigger();
select count(*) as links from preanalise_link_corretor;
