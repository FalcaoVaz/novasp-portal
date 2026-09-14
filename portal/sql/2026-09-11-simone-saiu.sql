-- ═══════════════════════════════════════════════════════════════
-- SIMONE CIRINO saiu da empresa (set/2026). Desativa e transfere os
-- liderados dela pro João Marcos (gerente de Adm). Rodar bloco a bloco.
--   Simone  772c83cc-d966-4cf8-93c8-a4eb8c129be6
--   João    a5d9e0c2-5263-4966-a085-e959c58d18b4
--   Rodrigo ab298053-5358-4d14-a830-faed006d33c0
-- ═══════════════════════════════════════════════════════════════

-- 1) Desativa a Simone (some do login e das listas)
update usuarios set ativo=false
where id='772c83cc-d966-4cf8-93c8-a4eb8c129be6';

-- 2) Encerra os vinculos onde a Simone era LIDER (6 pessoas)
update gestao_liderados set ativo=false, data_fim=current_date
where lider_id='772c83cc-d966-4cf8-93c8-a4eb8c129be6' and ativo;

-- 3) Garante que o João reporta ao Rodrigo (se ainda nao)
insert into gestao_liderados (lider_id, colaborador_id, ativo, data_inicio)
select 'ab298053-5358-4d14-a830-faed006d33c0',
       'a5d9e0c2-5263-4966-a085-e959c58d18b4', true, current_date
where not exists (
  select 1 from gestao_liderados
  where lider_id='ab298053-5358-4d14-a830-faed006d33c0'
    and colaborador_id='a5d9e0c2-5263-4966-a085-e959c58d18b4' and ativo);

-- 4) Time da Simone (menos o proprio João) passa pro João Marcos
insert into gestao_liderados (lider_id, colaborador_id, ativo, data_inicio)
select 'a5d9e0c2-5263-4966-a085-e959c58d18b4', g.colaborador_id, true, current_date
from gestao_liderados g
where g.lider_id='772c83cc-d966-4cf8-93c8-a4eb8c129be6'
  and g.data_fim=current_date
  and g.colaborador_id <> 'a5d9e0c2-5263-4966-a085-e959c58d18b4'
  and not exists (
    select 1 from gestao_liderados x
    where x.lider_id='a5d9e0c2-5263-4966-a085-e959c58d18b4'
      and x.colaborador_id=g.colaborador_id and x.ativo);

-- 5) Conferencia: organograma do João depois (deve incluir Vinicius,
--    Richard, Cibele, Vanderleia, Mikaeli); Simone sem time e inativa
select ul.nome as lider, uc.nome as colaborador
from gestao_liderados g
join usuarios ul on ul.id=g.lider_id
join usuarios uc on uc.id=g.colaborador_id
where g.ativo and g.lider_id='a5d9e0c2-5263-4966-a085-e959c58d18b4'
order by uc.nome;
