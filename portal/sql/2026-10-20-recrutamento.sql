-- ═══════════════════════════════════════════════════════════════
-- RECRUTAMENTO — Funil de Corretores (pedido do Rodrigo, 20/10/2026, para a Dayani do RH)
-- Candidatos que o RH contata e entrevista: contato → resposta → entrevista online → presencial → resultado.
-- Acesso (dados pessoais: nome, telefone, e-mail): admins + quem está em rh_acesso
--   (Dayani e os 4 gerentes de vendas). Para incluir alguém depois: insert into rh_acesso (email) values ('...');
-- Alterações ficam na Auditoria (trigger genérica de 2026-10-01-auditoria.sql).
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
begin;

create table if not exists rh_acesso (
  email text primary key
);
insert into rh_acesso (email) values
  ('financeiro@novasaopaulo.com.br'),        -- Dayani (RH)
  ('renata@novasaopaulo.com.br'),            -- Renata
  ('felippe.lemos@novasaopaulo.com.br'),     -- Felippe
  ('gerenciavendas@novasaopaulo.com.br'),    -- Christiane
  ('emilia.vitoria@novasaopaulo.com.br'),    -- Emilia
  ('leandro.nogueira@novasaopaulo.com.br')   -- Nogueira (22/10/2026)
on conflict do nothing;
alter table rh_acesso enable row level security;
revoke all on rh_acesso from anon, authenticated;

create or replace function rh_pode() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios u where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and coalesce(u.ativo, true) and u.admin)
      or exists (select 1 from rh_acesso a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function rh_pode() from public, anon;
grant execute on function rh_pode() to authenticated;

create table if not exists rh_candidatos (
  id                uuid primary key default gen_random_uuid(),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  criado_por        text,                                  -- e-mail de quem cadastrou
  nome              text not null,
  telefone          text,
  email             text,
  origem            text,                                  -- Indeed, LinkedIn, Indicação, Instagram…
  responsavel       text,                                  -- quem conduz (Dayani ou o gerente)
  data_entrada      date not null default current_date,
  contato           text not null default '' check (contato in ('', 'sim', 'sem_sucesso')),
  resposta          text not null default '' check (resposta in ('', 'sim', 'nao')),
  online            text not null default '' check (online in ('', 'marcada', 'realizada', 'faltou')),
  online_em         timestamptz,
  presencial        text not null default '' check (presencial in ('', 'marcada', 'realizada', 'faltou')),
  presencial_em     timestamptz,
  resultado         text not null default 'andamento' check (resultado in ('andamento', 'aprovado', 'nao_aprovado', 'desistiu')),
  equipe            text,                                  -- equipe de destino, se aprovado
  observacoes       text,
  -- perfil
  creci             text not null default '' check (creci in ('', 'tem', 'estudante', 'nao')),
  creci_numero      text,
  experiencia       text not null default '' check (experiencia in ('', 'sem', 'ate1', '1a3', 'mais3')),
  area_interesse    text not null default '' check (area_interesse in ('', 'vendas', 'locacao', 'ambos')),
  regiao            text,                                  -- bairro/região onde mora
  -- entrevistas: respostas do roteiro, notas por critério e parecer, por etapa
  --   {"online": {"respostas": {"<id pergunta>": "…"}, "notas": {"comunicacao": 4, …}, "parecer": "…", "resultado": "seguir|nao_seguir"},
  --    "presencial": {…}}
  entrevistas       jsonb not null default '{}',
  motivo            text,                                  -- por que não foi aprovado / desistiu
  banco_talentos    boolean not null default false,        -- vale chamar de novo no futuro
  integracao        jsonb not null default '{}',           -- checklist do aprovado: {"documentos": true, "creci": true, …}
  aprovado_em       date
);
-- (quem rodou a primeira versão deste arquivo: as colunas novas entram aqui)
alter table rh_candidatos
  add column if not exists creci text not null default '',
  add column if not exists creci_numero text,
  add column if not exists experiencia text not null default '',
  add column if not exists area_interesse text not null default '',
  add column if not exists regiao text,
  add column if not exists entrevistas jsonb not null default '{}',
  add column if not exists motivo text,
  add column if not exists banco_talentos boolean not null default false,
  add column if not exists integracao jsonb not null default '{}',
  add column if not exists aprovado_em date;

-- Roteiro de entrevista: perguntas básicas que o RH edita na tela
create table if not exists rh_perguntas (
  id      uuid primary key default gen_random_uuid(),
  ordem   int not null default 0,
  etapa   text not null default 'ambas' check (etapa in ('online', 'presencial', 'ambas')),
  texto   text not null,
  ativo   boolean not null default true
);
alter table rh_perguntas enable row level security;
revoke all on rh_perguntas from anon;
grant select, insert, update, delete on rh_perguntas to authenticated;
drop policy if exists rh_perguntas_acesso on rh_perguntas;
create policy rh_perguntas_acesso on rh_perguntas for all to authenticated using (rh_pode()) with check (rh_pode());
insert into rh_perguntas (ordem, etapa, texto)
select v.ordem, v.etapa, v.texto from (values
  (1,  'online',     'Conte um pouco sobre você e sua trajetória profissional.'),
  (2,  'online',     'Por que quer trabalhar como corretor(a) de imóveis? E por que na Nova São Paulo?'),
  (3,  'online',     'Já trabalhou com vendas ou atendimento? Onde, por quanto tempo e com quais resultados?'),
  (4,  'online',     'Tem CRECI ou está cursando o TTI? Qual a previsão?'),
  (5,  'online',     'Qual sua disponibilidade de horários, inclusive fins de semana e plantões?'),
  (6,  'online',     'Onde mora e como se desloca (carro próprio, transporte público)?'),
  (7,  'online',     'Como se sente trabalhando com remuneração por comissão? Tem reserva para os primeiros meses?'),
  (8,  'presencial', 'Conhece a Zona Sul (Saúde, Vila Mariana, Moema, Jabaquara…)? Quais bairros conhece bem?'),
  (9,  'presencial', 'Simulação: um cliente liga interessado num apartamento. Como você conduz o atendimento?'),
  (10, 'presencial', 'Como você buscaria novos clientes e captações de imóveis?'),
  (11, 'presencial', 'Conte uma negociação difícil que conduziu e como resolveu.'),
  (12, 'presencial', 'Quais suas metas para os próximos 12 meses?'),
  (13, 'ambas',      'Tem alguma dúvida sobre a empresa, a equipe ou o modelo de trabalho?')
) as v(ordem, etapa, texto)
where not exists (select 1 from rh_perguntas);
create index if not exists rh_candidatos_entrada on rh_candidatos (data_entrada desc);
alter table rh_candidatos enable row level security;
revoke all on rh_candidatos from anon;
grant select, insert, update, delete on rh_candidatos to authenticated;
drop policy if exists rh_candidatos_acesso on rh_candidatos;
create policy rh_candidatos_acesso on rh_candidatos for all to authenticated using (rh_pode()) with check (rh_pode());

-- auditoria: quem mexeu em quê
drop trigger if exists trg_auditoria on rh_candidatos;
create trigger trg_auditoria after insert or update or delete on rh_candidatos for each row execute function auditoria_trigger();
drop trigger if exists trg_auditoria on rh_perguntas;
create trigger trg_auditoria after insert or update or delete on rh_perguntas for each row execute function auditoria_trigger();

commit;

-- Conferência
select email from rh_acesso order by 1;
select count(*) as perguntas from rh_perguntas;
select tablename, policyname from pg_policies where tablename = 'rh_candidatos';
