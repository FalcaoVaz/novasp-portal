-- ═══════════════════════════════════════════════════════════════
-- JOÃO MARCOS assume a gerência de Administração (no lugar da
-- Simone); Simone vira gerente de Grandes Contas. 05/08/2026.
-- Rodar bloco a bloco no SQL Editor.
--
-- ids envolvidos:
--   Rodrigo  ab298053-5358-4d14-a830-faed006d33c0
--   Simone   772c83cc-d966-4cf8-93c8-a4eb8c129be6
--   João     a5d9e0c2-5263-4966-a085-e959c58d18b4
-- ═══════════════════════════════════════════════════════════════

-- 1) Departamentos + normalizacao do cadastro do Joao (estava tudo
--    em maiusculas: "JOÃO MARCOS" / "JOAO@NOVASAOPAULO.COM.BR")
update usuarios
set nome = 'João Marcos', email = 'joao@novasaopaulo.com.br',
    dept = 'Administração'
where id = 'a5d9e0c2-5263-4966-a085-e959c58d18b4';

update usuarios set dept = 'Grandes Contas'
where id = '772c83cc-d966-4cf8-93c8-a4eb8c129be6';

-- 2) Encerra os vinculos ativos em que a Simone e lider
--    (Joao, Vinicius, Richard, Cibele, Vanderleia, Mikaeli)
update gestao_liderados
set ativo = false, data_fim = current_date
where lider_id = '772c83cc-d966-4cf8-93c8-a4eb8c129be6' and ativo;

-- 3) Joao passa a reportar direto ao Rodrigo (vinculo de gerente)
insert into gestao_liderados (lider_id, colaborador_id, ativo, data_inicio)
values ('ab298053-5358-4d14-a830-faed006d33c0',
        'a5d9e0c2-5263-4966-a085-e959c58d18b4', true, current_date);

-- 4) O time da Simone passa pro Joao (menos o proprio Joao)
insert into gestao_liderados (lider_id, colaborador_id, ativo, data_inicio)
select 'a5d9e0c2-5263-4966-a085-e959c58d18b4', colaborador_id, true, current_date
from gestao_liderados
where lider_id = '772c83cc-d966-4cf8-93c8-a4eb8c129be6'
  and colaborador_id <> 'a5d9e0c2-5263-4966-a085-e959c58d18b4'
  and data_fim = current_date;

-- 5) Conferencia: organograma novo (Joao deve aparecer como lider de
--    Vinicius, Richard, Cibele, Vanderleia e Mikaeli; Simone sem time)
select ul.nome as lider, uc.nome as colaborador
from gestao_liderados g
join usuarios ul on ul.id = g.lider_id
join usuarios uc on uc.id = g.colaborador_id
where g.ativo
order by ul.nome, uc.nome;

-- OBS: o vinculo Rodrigo -> Simone fica como esta (ela segue gerente,
-- agora de Grandes Contas). Se ela for liderar contas/pessoas novas,
-- cadastre pelos "Meus Liderados" no portal mesmo.
