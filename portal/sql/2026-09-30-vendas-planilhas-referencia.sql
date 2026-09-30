-- Planilha Mensal por EQUIPE — regra da referência (correção do Anderson, 30/09/2026).
-- Referência precisa conter numeração; letras são opcionais; só letras maiúsculas e dígitos.
-- A prévia da importação já BLOQUEIA a gravação quando há referência inválida; este check
-- é a garantia no banco (nunca deve disparar). Aplicado em produção em 30/09/2026.
alter table vendas_planilhas_linhas drop constraint if exists vendas_planilhas_linhas_referencia_check;
alter table vendas_planilhas_linhas add constraint vendas_planilhas_linhas_referencia_check
  check (referencia is null or referencia ~ '^[A-Z0-9]*[0-9][A-Z0-9]*$');
select 'ok — check de referencia em vendas_planilhas_linhas' as status;
