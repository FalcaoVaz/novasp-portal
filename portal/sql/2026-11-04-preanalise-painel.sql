-- ═══════════════════════════════════════════════════════════════
-- PRÉ-ANÁLISE — painel, prazos, conferência da leitura e revisão jurídica (04/11/2026)
-- Traz para o portal as melhorias da versão local da Renata (painel com semáforo e prazos, conferência obrigatória da
-- leitura da matrícula, revisão jurídica registrada). Mensagens de pendências, uso da semana e parecer em PDF são só tela.
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
alter table preanalise_venda add column if not exists data_compromisso     date;
alter table preanalise_venda add column if not exists prazo_escritura_dias integer;
alter table preanalise_venda add column if not exists escritura_feita      boolean not null default false;
alter table preanalise_venda add column if not exists prazos               jsonb not null default '[]'::jsonb;   -- [{titulo, data, feito}]

-- conferência da leitura: vale para UMA análise (uma análise nova pede conferência de novo)
alter table preanalise_venda add column if not exists leitura_conferida_exec uuid;
alter table preanalise_venda add column if not exists leitura_conferida_por  text;
alter table preanalise_venda add column if not exists leitura_conferida_em   timestamptz;
alter table preanalise_venda add column if not exists leitura_nota           text;           -- o que a gerente corrigiu à mão

-- revisão jurídica registrada
alter table preanalise_venda add column if not exists revisao_status text;
alter table preanalise_venda add column if not exists revisao_nota   text;
alter table preanalise_venda add column if not exists revisado_por   text;
alter table preanalise_venda add column if not exists revisado_em    timestamptz;
alter table preanalise_venda drop constraint if exists preanalise_venda_revisao_status_check;
alter table preanalise_venda add constraint preanalise_venda_revisao_status_check
  check (revisao_status is null or revisao_status in ('aprovado', 'aprovado_ressalvas', 'nao_aprovado'));

-- auditoria: quem mexeu em quê (trigger genérica de 2026-10-01-auditoria.sql)
drop trigger if exists trg_auditoria on preanalise_venda;
create trigger trg_auditoria after insert or update or delete on preanalise_venda for each row execute function auditoria_trigger();

select 'ok — pré-análise: prazos, conferência e revisão jurídica' as status;
