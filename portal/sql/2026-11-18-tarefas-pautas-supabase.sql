-- 18/11/2026 — TAREFAS e PAUTAS saem da planilha (Apps Script) e vêm para o banco, como a agenda em 11/09.
-- Motivos: a planilha era lida/gravada por um endereço público (sem login), lenta (4–20 s, às vezes travava e a tela
-- mostrava dado velho), a aba PAUTA_JURIDICO nem existia (itens da pauta do jurídico não gravavam) e a aba TAREFAS
-- não tinha a coluna de comentários (comentário em tarefa se perdia).
-- Mesmas colunas da planilha (datas em texto AAAA-MM-DD, '' = vazio), para nenhuma regra de tela mudar.
-- A tabela antiga "tarefas" (vazia, esboço de jul/2026, não usada) fica como está.
-- Depois de rodar: carregar os dados com sandbox/migrar_tarefas_pautas.py --gravar (Rodrigo), e só então publicar o portal.

create table if not exists calendar_tarefas (
  id               bigint primary key,               -- Date.now() do portal, como na planilha
  titulo           text not null default '',
  status           text not null default 'Não iniciado',
  prazo            text not null default '',
  prioridade       text not null default '',
  responsavel      text not null default '',
  delegar_para     text not null default '',
  categoria        text not null default '',
  observacoes      text not null default '',
  data_criacao     text not null default '',
  semana_conclusao text not null default '',
  data_conclusao   text not null default '',
  comentario       text not null default '',          -- histórico JSON [{data, autor, texto}], mais recente primeiro
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create table if not exists calendar_pauta (
  id               bigint primary key,
  reuniao          text not null check (reuniao in ('PAUTA_TERCA','PAUTA_QUARTA','PAUTA_JURIDICO','PAUTA_FELIPPE',
                                                    'PAUTA_EMILIA','PAUTA_RENATA','PAUTA_CHRISTIANE')),
  data_reuniao     text not null default '',
  item             text not null default '',
  responsavel      text not null default '',
  status           text not null default 'Pendente',
  comentario       text not null default '',
  data_conclusao   text not null default '',
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists calendar_pauta_reuniao on calendar_pauta (reuniao);

-- atualizado_em automático
create or replace function calendar_toca_atualizado() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists trg_atualizado on calendar_tarefas;
create trigger trg_atualizado before update on calendar_tarefas for each row execute function calendar_toca_atualizado();
drop trigger if exists trg_atualizado on calendar_pauta;
create trigger trg_atualizado before update on calendar_pauta for each row execute function calendar_toca_atualizado();

-- mesma regra da agenda: qualquer usuário logado do portal (menos corretor do site)
alter table calendar_tarefas enable row level security;
alter table calendar_pauta   enable row level security;
drop policy if exists "acesso autenticado" on calendar_tarefas;
create policy "acesso autenticado" on calendar_tarefas for all to authenticated using (not eh_corretor_site()) with check (not eh_corretor_site());
drop policy if exists "acesso autenticado" on calendar_pauta;
create policy "acesso autenticado" on calendar_pauta for all to authenticated using (not eh_corretor_site()) with check (not eh_corretor_site());
grant select, insert, update, delete on calendar_tarefas, calendar_pauta to authenticated;

-- auditoria (quem mudou o quê), como nas outras tabelas
drop trigger if exists trg_auditoria on calendar_tarefas;
create trigger trg_auditoria after insert or update or delete on calendar_tarefas for each row execute function auditoria_trigger();
drop trigger if exists trg_auditoria on calendar_pauta;
create trigger trg_auditoria after insert or update or delete on calendar_pauta for each row execute function auditoria_trigger();

select 'calendar_tarefas' as tabela, count(*) from calendar_tarefas
union all select 'calendar_pauta', count(*) from calendar_pauta;
