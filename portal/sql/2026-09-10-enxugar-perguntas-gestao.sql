-- ═══════════════════════════════════════════════════════════════
-- ENXUGAR AVALIACAO (Gestao & Feedback) — 10/09/2026.
-- De 23 → 16 perguntas. NAO deleta: marca ativa=false (reversivel) e
-- reescreve as que absorveram outra. Rodar bloco a bloco.
--
-- Antes/depois:
--   ESCALA (nota): 12 → 9  (funde 3 pares redundantes)
--   TEXTO (aberta): 10 → 6  (funde 4 duplicatas mensal/trimestral)
--   CUSTOM: 1 (mantida — especifica de 1 colaborador)
-- ═══════════════════════════════════════════════════════════════

-- 1) Reescreve as 6 perguntas que passam a cobrir a dupla
update gestao_perguntas set pergunta='Cumpre prazos e organiza bem o próprio tempo'                where id=1;
update gestao_perguntas set pergunta='Toma iniciativa e resolve problemas com autonomia'           where id=2;
update gestao_perguntas set pergunta='Entrega trabalho com qualidade e atenção a detalhes'         where id=5;
update gestao_perguntas set pergunta='O que precisa melhorar / desenvolver'                        where id=15;
update gestao_perguntas set pergunta='Apoio e compromissos que espera do líder'                    where id=16;
update gestao_perguntas set pergunta='Metas e compromissos para o próximo período'                 where id=17;

-- 2) Desativa as 7 redundantes (as que foram absorvidas acima)
--    #6 detalhes→#5 | #7 autonomia→#2 | #8 tempo→#1
--    #18 compromissos lider→#16 | #20 melhoria→#15 | #22 compromissos colab→#17
--    #19 pontos fortes→coberto por #13 (conquistas)
update gestao_perguntas set ativa=false where id in (6,7,8,18,19,20,22);

-- 3) Conferencia: o que fica ATIVO (esperado 16 — 9 escala + 6 texto + 1 custom)
select bloco, tipo, count(*) filter (where ativa) as ativas
from gestao_perguntas group by bloco, tipo order by bloco;

select id, bloco, tipo, pergunta from gestao_perguntas
where ativa order by ordem, id;

-- ── DESFAZER (se quiser voltar ao estado anterior) ──────────────
-- update gestao_perguntas set ativa=true where id in (6,7,8,18,19,20,22);
-- (os textos reescritos de 1,2,5,15,16,17 podem ficar — sao melhorias)
