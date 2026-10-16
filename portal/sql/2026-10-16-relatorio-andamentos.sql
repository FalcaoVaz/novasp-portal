-- ═══════════════════════════════════════════════════════════════
-- RELATÓRIO DE ANDAMENTOS (pedido da Fernanda, 30/09/2026; modelo "Andamentos Setembro/2026 unificado e-SAJ + eproc").
-- Adaptado ao jurídico como ele é (páginas no Netlify + Supabase), sem servidor Node:
--   · andamentos_tjsp ......... última consulta ao e-SAJ de cada processo (situação, classe, vara e movimentações)
--   · planilhas_eproc ......... planilhas que as advogadas exportam do eproc (o eproc tem bloqueio anti-robô)
--   · relatorios_andamentos ... histórico dos relatórios emitidos (resumo + PDF no bucket "relatorios-andamentos")
--   · dias_sem_expediente ..... dias extras sem expediente (suspensões, sistema fora); feriados fixos já estão no código
--   · prazos .................. ganha origem, chave (para não lançar duas vezes), regra da data e conferência
-- Tudo restrito ao jurídico (eh_juridico(), 12/10/2026): o relatório traz nomes das partes.
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
begin;

-- 1) Consultas ao e-SAJ (uma linha por processo, sobrescrita a cada consulta)
create table if not exists andamentos_tjsp (
  numero         text primary key,                 -- 20 dígitos, sem máscara
  fonte          text not null default 'esaj',
  consultado_em  timestamptz not null default now(),
  encontrado     boolean,
  situacao       text,                             -- etiqueta do e-SAJ: Suspenso, Arquivado, Extinto…
  classe         text,
  vara           text,
  foro           text,
  juiz           text,
  movimentos     jsonb not null default '[]',      -- [{data:'2026-10-05', titulo:'Arquivado Provisoriamente', texto:'…'}], mais recente primeiro
  erro           text
);

-- 2) Planilhas do eproc (as linhas já vêm lidas e normalizadas pela tela)
create table if not exists planilhas_eproc (
  id            uuid primary key default gen_random_uuid(),
  enviado_em    timestamptz not null default now(),
  enviado_por   uuid references usuarios(id),
  advogado      text,                              -- nome do responsável (carteira) a que a planilha se refere
  nome_arquivo  text,
  linhas        jsonb not null default '[]',       -- [{numero, evento, data_evento, prazo_inicio, prazo_fim, situacao, classe, orgao, atendido}]
  resumo        jsonb
);
create index if not exists planilhas_eproc_recentes on planilhas_eproc (advogado, enviado_em desc);

-- 3) Histórico dos relatórios
create table if not exists relatorios_andamentos (
  id            uuid primary key default gen_random_uuid(),
  emitido_em    timestamptz not null default now(),
  emitido_por   uuid references usuarios(id),
  advogado      text,                              -- filtro da tela (vazio = todas as carteiras)
  referencia    date not null,
  resumo        jsonb,                             -- {analisados, urgentes, parados, regulares, arquivados, pendentes, alteracoes, prazos_novos}
  pdf_path      text                               -- caminho no bucket relatorios-andamentos
);

-- 4) Dias sem expediente além dos feriados que o código já conhece
create table if not exists dias_sem_expediente (
  data    date primary key,
  motivo  text not null
);

-- 5) Prazos: lançamentos automáticos do relatório
alter table prazos
  add column if not exists origem             text not null default 'manual',   -- 'manual' | 'relatorio_andamentos'
  add column if not exists chave_automatica   text,                             -- mesma providência = mesma chave (não duplica)
  add column if not exists origem_data        text,                             -- Prazo do eproc | Calculado do despacho | Prazo legal | Data interna
  add column if not exists regra_calculo      text,                             -- explicação de como a data foi calculada
  add column if not exists status_conferencia text;                             -- 'a_conferir' | 'confirmado' | 'descartado' (null nos manuais)
create unique index if not exists prazos_chave_automatica on prazos (chave_automatica);

-- 6) RLS: só o jurídico
do $$
declare t text;
begin
  foreach t in array array['andamentos_tjsp', 'planilhas_eproc', 'relatorios_andamentos', 'dias_sem_expediente'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('drop policy if exists juridico on %I', t);
    execute format('create policy juridico on %I for all to authenticated using (eh_juridico()) with check (eh_juridico())', t);
  end loop;
end $$;

-- 7) Bucket privado dos PDFs (10 MB, só PDF)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('relatorios-andamentos', 'relatorios-andamentos', false, 10485760, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];
drop policy if exists relatorios_andamentos_ler on storage.objects;
drop policy if exists relatorios_andamentos_enviar on storage.objects;
create policy relatorios_andamentos_ler on storage.objects for select to authenticated using (bucket_id = 'relatorios-andamentos' and public.eh_juridico());
create policy relatorios_andamentos_enviar on storage.objects for insert to authenticated with check (bucket_id = 'relatorios-andamentos' and public.eh_juridico());

commit;

-- Conferência
select tablename, policyname from pg_policies
 where tablename in ('andamentos_tjsp', 'planilhas_eproc', 'relatorios_andamentos', 'dias_sem_expediente') order by 1;
select column_name from information_schema.columns
 where table_name = 'prazos' and column_name in ('origem', 'chave_automatica', 'origem_data', 'regra_calculo', 'status_conferencia');
