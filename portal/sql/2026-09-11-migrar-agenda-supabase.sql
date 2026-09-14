-- ═══════════════════════════════════════════════════════════════
-- MIGRACAO DA AGENDA: Google Apps Script (planilha) → Supabase
-- 11/09/2026. Resolve a lentidao/nao-grava de raiz (o GAS gratis do
-- Google era o gargalo). Rodar bloco a bloco.
--
-- A tabela agenda_eventos ja existia vazia com schema errado
-- (responsavel_id uuid, um so). Recriamos com o schema que casa com
-- o codigo atual: participantes por NOME (texto) e "pessoal" via tipo.
-- ═══════════════════════════════════════════════════════════════

drop table if exists agenda_eventos;

create table agenda_eventos (
  id           bigint primary key,          -- mesmo id do codigo (Date.now())
  titulo       text not null,
  data         date,
  hora_inicio  text,                         -- 'HH:MM'
  hora_fim     text,
  tipo         text,                         -- 'Reuniao','Visita',... ou 'Pessoal'
  responsavel  text,                         -- nomes separados por virgula (dono, se Pessoal)
  descricao    text,
  criado_em    timestamptz default now()
);

-- RLS igual ao resto do banco: so usuario autenticado acessa.
alter table agenda_eventos enable row level security;
drop policy if exists "acesso autenticado" on agenda_eventos;
create policy "acesso autenticado" on agenda_eventos
  for all to authenticated using (true) with check (true);

-- indice pra busca por data (a agenda filtra por semana)
create index if not exists idx_agenda_data on agenda_eventos (data);

-- Conferencia (deve vir vazia — a importacao dos 248 eventos e o
-- proximo passo, feito pelo Rodrigo/assistente via script)
select count(*) as eventos_na_tabela from agenda_eventos;
