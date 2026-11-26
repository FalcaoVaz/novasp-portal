-- 26/11/2026 — ENTREGA DE CHAVES: nova etapa "Vistoria agendada" entre "Entrega das chaves" e "Vistoria realizada" (pedido do João).
-- data_vistoria_agendada = data MARCADA para a vistoria (pode ser futura).
-- Processos que já tiveram a vistoria realizada recebem a mesma data, para não voltarem a "Vistoria agendada".
alter table chaves_processos add column if not exists data_vistoria_agendada date;
update chaves_processos set data_vistoria_agendada = data_vistoria
 where data_vistoria is not null and data_vistoria_agendada is null;
notify pgrst, 'reload schema';
