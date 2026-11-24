-- 24/11/2026 — Prazos mensais de vendas na Agenda do portal (pedido do Rodrigo), de dez/2026 a nov/2027:
--  · dia 5  — assistentes inserem no portal a planilha do mês (cotas de destaque/super destaque, cota extra de quem bateu a
--             meta, captação/placas) e a seleção de imóveis escolhida pela equipe (pendentes da Peneira)
--  · dia 10 — gerentes votam a seleção na Peneira
-- Participantes: gerentes, assistentes e marketing (Thais e Anderson) + Rodrigo. Alerta por e-mail a quem não fez:
-- função falcaovaz prazos-vendas (dias 5/6 e 10/11). Pode rodar de novo (apaga e recria a série).
delete from agenda_eventos where repete_grupo in (2026112405, 2026112410);
insert into agenda_eventos (id, titulo, data, hora_inicio, hora_fim, tipo, responsavel, descricao, repete_grupo, agenda)
select 2026112405000 + i, '⏰ Prazo: planilha do mês (destaques, cota extra) e seleção da equipe',
       (date '2026-12-05' + (i || ' month')::interval)::date, '09:00', '18:00', 'Prazo',
       'Leticia, Karina Collote, Amanda da Silva Lira, Camille, Renata Navarro, Christiane, Felippe, Emilia, Thais, Anderson, Rodrigo Falcão Vaz',
       'Até hoje as assistentes inserem no portal (Vendas): a planilha do mês da equipe (cota de anúncios Destaque/Super Destaque, cota extra de quem bateu a meta de 5 captações, captação e placas) e a seleção de imóveis escolhida pela equipe (pendentes da Peneira). Quem não tiver feito recebe alerta por e-mail.',
       2026112405, 'nsp'
from generate_series(0, 11) i;
insert into agenda_eventos (id, titulo, data, hora_inicio, hora_fim, tipo, responsavel, descricao, repete_grupo, agenda)
select 2026112410000 + i, '🗳️ Prazo: votação dos gerentes na Peneira (seleção do mês)',
       (date '2026-12-10' + (i || ' month')::interval)::date, '09:00', '18:00', 'Prazo',
       'Renata Navarro, Christiane, Felippe, Emilia, Rodrigo Falcão Vaz, Leticia, Karina Collote, Amanda da Silva Lira, Camille, Thais, Anderson',
       'Até hoje os gerentes votam todos os imóveis pendentes da seleção do mês (Vendas → Peneira). Quem não tiver votado recebe alerta por e-mail.',
       2026112410, 'nsp'
from generate_series(0, 11) i;
select tipo, count(*), min(data), max(data) from agenda_eventos where repete_grupo in (2026112405, 2026112410) group by 1;
