-- ═══════════════════════════════════════════════════════════════
-- JURÍDICO — novidades do painel da Dra. Fernanda (09/11/2026), só o que o portal ainda não tinha:
--   1) custas pagas por processo;  2) petições protocoladas (produtividade);  3) resultado do processo (ganha/perdida…);
--   4) data em que o prazo foi cumprido (para "cumpridos no prazo");  5) cobranças extrajudiciais da reunião mensal;
--   6) juros pela taxa legal (Lei 14.905/2024) nos cálculos salvos.
-- Mesma regra de acesso das tabelas do jurídico: eh_juridico(). Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════

-- 1) custas
create table if not exists juridico_custas (
  id            uuid primary key default gen_random_uuid(),
  processo_id   uuid not null references processos(id) on delete cascade,
  data          date not null default current_date,
  valor         numeric not null check (valor >= 0),
  tipo          text,                       -- inicial, diligência, preparo, perícia, outra
  descricao     text,
  criado_por_id uuid references usuarios(id),
  criado_em     timestamptz not null default now()
);
create index if not exists juridico_custas_proc_ix on juridico_custas (processo_id);

-- 2) petições protocoladas
create table if not exists juridico_peticoes (
  id            uuid primary key default gen_random_uuid(),
  processo_id   uuid references processos(id) on delete set null,
  data          date not null default current_date,
  tipo          text,                       -- inicial, manifestação, recurso, cumprimento, acordo, outra
  descricao     text,
  advogado_id   uuid references usuarios(id),
  criado_por_id uuid references usuarios(id),
  criado_em     timestamptz not null default now()
);
create index if not exists juridico_peticoes_data_ix on juridico_peticoes (data desc);

-- 3) resultado do processo
alter table processos add column if not exists resultado      text;
alter table processos add column if not exists resultado_data date;
alter table processos add column if not exists resultado_nota text;
alter table processos drop constraint if exists processos_resultado_check;
alter table processos add constraint processos_resultado_check check (resultado is null or resultado in ('ganha', 'perdida', 'parcial', 'acordo', 'extinto'));

-- 4) quando o prazo foi cumprido (preenchido sozinho ao marcar concluído; volta a vazio ao desmarcar)
alter table prazos add column if not exists concluido_em date;
create or replace function prazos_concluido_em() returns trigger language plpgsql as $$
begin
  if new.concluido and (tg_op = 'INSERT' or not coalesce(old.concluido, false)) and new.concluido_em is null then
    new.concluido_em := (now() at time zone 'America/Sao_Paulo')::date;
  elsif not coalesce(new.concluido, false) then
    new.concluido_em := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_prazos_concluido_em on prazos;
create trigger trg_prazos_concluido_em before insert or update on prazos for each row execute function prazos_concluido_em();

-- 5) cobranças extrajudiciais (planilha da reunião mensal)
create table if not exists juridico_cobrancas (
  contrato       text primary key,
  vencimento     date,
  status         text,
  locador        text,
  locatario      text,
  observacao     text,
  ativo          boolean not null default true,       -- some da lista quando sai da planilha
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);

-- 6) juros pela taxa legal nos cálculos salvos
alter table calculos_atualizacao drop constraint if exists calculos_atualizacao_juros_tipo_check;
alter table calculos_atualizacao add constraint calculos_atualizacao_juros_tipo_check check (juros_tipo = any (array['simples', 'composto', 'taxa_legal']));

-- acesso: só o jurídico
do $$ declare t text; begin
  foreach t in array array['juridico_custas', 'juridico_peticoes', 'juridico_cobrancas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop policy if exists juridico on %I', t);
    execute format('create policy juridico on %I for all to authenticated using (eh_juridico()) with check (eh_juridico())', t);
  end loop;
end $$;

-- auditoria (mesma função das outras tabelas, se existir)
do $$ declare t text; begin
  if exists (select 1 from pg_proc where proname = 'auditoria_trigger') then
    foreach t in array array['juridico_custas', 'juridico_peticoes', 'juridico_cobrancas'] loop
      execute format('drop trigger if exists trg_auditoria on %I', t);
      execute format('create trigger trg_auditoria after insert or update or delete on %I for each row execute function auditoria_trigger()', t);
    end loop;
  end if;
end $$;

select 'ok — jurídico: custas, petições protocoladas, resultado, prazo cumprido em, cobranças, taxa legal' as status;
