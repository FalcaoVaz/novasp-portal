-- 25/11/2026 — COBRANÇA: locatários inadimplentes vindos do Imoview, com o responsável pela cobrança.
--   extrajudicial → Janaína · judicial (locatário é réu em processo ativo do jurídico) → advogado do processo · seguro fiança → João
-- Os dados vêm da função falcaovaz inadimplencia-sync-background (Imoview, usuário de integração), a cada 30 min e no botão
-- "Atualizar agora". O responsável automático pode ser trocado à mão (cobranca_contratos) e o financeiro pode tirar da lista
-- cobranças que já foram pagas no Guess (cobranca_ignorados). Acesso: financeiro, jurídico e administrativo (cobranca_pode()).

create or replace function cobranca_pode() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios u where coalesce(u.ativo, true) and lower(u.email) = lower(coalesce(auth.jwt()->>'email', ''))
     and (u.admin or u.judicial or u.acesso_juridico
          or u.dept ~* '(financeiro|encargos|jur[ií]dico|administra|diretoria|superintend)'));
$$;
revoke all on function cobranca_pode() from public, anon;
grant execute on function cobranca_pode() to authenticated;

-- cobranças vencidas em aberto (uma linha por movimento do Imoview); reescrita a cada sincronização
create table if not exists cobranca_aberto (
  movimento         integer primary key,
  contrato          integer not null,
  codigo_auxiliar   text not null default '',
  locatario_codigo  integer,
  locatario_nome    text not null default '',
  endereco          text not null default '',
  garantia          text not null default '',
  vencimento        date not null,
  valor             numeric(12,2) not null default 0,
  historico         text not null default '',
  tem_boleto        boolean not null default false,
  tipo_auto         text not null default 'extrajudicial',   -- extrajudicial | judicial | seguro
  responsavel_auto  text not null default '',
  processo_auto     text not null default '',
  atualizado_em     timestamptz not null default now()
);
create index if not exists cobranca_aberto_contrato on cobranca_aberto (contrato);

-- atribuição manual por contrato (sobrepõe a automática) + observação
create table if not exists cobranca_contratos (
  contrato      integer primary key,
  tipo          text check (tipo in ('extrajudicial', 'judicial', 'seguro')),
  responsavel   text not null default '',
  processo      text not null default '',
  observacao    text not null default '',
  alterado_por  text not null default '',
  alterado_em   timestamptz not null default now()
);

-- cobranças que o financeiro confirmou como pagas fora do Imoview (ex.: boleto do Guess) → saem da lista
create table if not exists cobranca_ignorados (
  movimento  integer primary key,
  motivo     text not null default 'Pago no Guess',
  por        text not null default '',
  em         timestamptz not null default now()
);

create table if not exists cobranca_sync (
  id          integer primary key default 1 check (id = 1),
  inicio      timestamptz, fim timestamptz,
  situacao    text not null default '',
  movimentos  integer not null default 0
);
insert into cobranca_sync (id) values (1) on conflict do nothing;

alter table cobranca_aberto    enable row level security;
alter table cobranca_contratos enable row level security;
alter table cobranca_ignorados enable row level security;
alter table cobranca_sync      enable row level security;
revoke all on cobranca_aberto, cobranca_contratos, cobranca_ignorados, cobranca_sync from anon;
drop policy if exists cobranca_ler on cobranca_aberto;
create policy cobranca_ler on cobranca_aberto for select to authenticated using (cobranca_pode());
drop policy if exists cobranca_ler on cobranca_sync;
create policy cobranca_ler on cobranca_sync for select to authenticated using (cobranca_pode());
drop policy if exists cobranca_tudo on cobranca_contratos;
create policy cobranca_tudo on cobranca_contratos for all to authenticated using (cobranca_pode()) with check (cobranca_pode());
drop policy if exists cobranca_tudo on cobranca_ignorados;
create policy cobranca_tudo on cobranca_ignorados for all to authenticated using (cobranca_pode()) with check (cobranca_pode());
grant select on cobranca_aberto, cobranca_sync to authenticated;
grant select, insert, update, delete on cobranca_contratos, cobranca_ignorados to authenticated;

drop trigger if exists trg_auditoria on cobranca_contratos;
create trigger trg_auditoria after insert or update or delete on cobranca_contratos for each row execute function auditoria_trigger();
drop trigger if exists trg_auditoria on cobranca_ignorados;
create trigger trg_auditoria after insert or update or delete on cobranca_ignorados for each row execute function auditoria_trigger();

select 'ok — cobrança' as status, (select count(*) from cobranca_aberto) as abertos;
