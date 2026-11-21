-- 21/11/2026 — MANUTENÇÃO sai da planilha (Apps Script) e vem para o banco (etapa 2 da saída do Apps Script).
-- Motivos: o endereço do Apps Script era público (qualquer um listava nome/telefone/e-mail dos inquilinos), os e-mails
-- saíam da conta do Rodrigo e o histórico de andamentos não era gravado (a planilha não tinha a coluna).
-- Mesmos campos da planilha; andamentos em tabela própria. Os avisos por e-mail passam a sair pela função
-- falcaovaz /.netlify/functions/enviar-aviso (Resend, avisos@novasaopaulo.com.br; respostas p/ contato@ + João).
-- Depois de rodar: carregar os chamados com sandbox/migrar_manutencao.py --gravar (Rodrigo), e só então publicar o portal.

create table if not exists manutencao_chamados (
  protocolo        text primary key,
  data             date not null default current_date,
  nome             text not null default '',
  telefone         text not null default '',
  email            text not null default '',
  endereco         text not null default '',
  tipo_servico     text not null default '',
  status           text not null default 'Aberto',
  responsabilidade text not null default '',
  profissional     text not null default '',
  observacoes      text not null default '',
  valor            text not null default '',
  retorno_10       text not null default '',
  aberto_por       text not null default '',
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists manutencao_chamados_data on manutencao_chamados (data desc);

create table if not exists manutencao_andamentos (
  id         bigint generated always as identity primary key,
  protocolo  text not null references manutencao_chamados(protocolo) on delete cascade,
  em         timestamptz not null default now(),
  status     text not null default '',
  mensagem   text not null default '',
  autor      text not null default ''
);
create index if not exists manutencao_andamentos_proto on manutencao_andamentos (protocolo, em);

drop trigger if exists trg_atualizado on manutencao_chamados;
create trigger trg_atualizado before update on manutencao_chamados for each row execute function calendar_toca_atualizado();

-- mesma regra da agenda/tarefas: qualquer usuário logado do portal (menos corretor do site). Nada para anônimo.
alter table manutencao_chamados   enable row level security;
alter table manutencao_andamentos enable row level security;
revoke all on manutencao_chamados, manutencao_andamentos from anon;
drop policy if exists "acesso autenticado" on manutencao_chamados;
create policy "acesso autenticado" on manutencao_chamados for all to authenticated using (not eh_corretor_site()) with check (not eh_corretor_site());
drop policy if exists "acesso autenticado" on manutencao_andamentos;
create policy "acesso autenticado" on manutencao_andamentos for all to authenticated using (not eh_corretor_site()) with check (not eh_corretor_site());
grant select, insert, update on manutencao_chamados to authenticated;
grant select, insert on manutencao_andamentos to authenticated;

drop trigger if exists trg_auditoria on manutencao_chamados;
create trigger trg_auditoria after insert or update or delete on manutencao_chamados for each row execute function auditoria_trigger();

select 'manutencao_chamados' as tabela, count(*) from manutencao_chamados
union all select 'manutencao_andamentos', count(*) from manutencao_andamentos;
