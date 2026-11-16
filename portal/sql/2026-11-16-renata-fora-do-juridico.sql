-- 16/11/2026 — Renata sai do jurídico (Rodrigo): sem o módulo judicial (não aparece mais como membro da agenda do jurídico,
-- nem nas listas do Sistema Jurídico) — ela não tem processos sob responsabilidade. O acesso ao Sistema Jurídico
-- (acesso_juridico) já estava desligado desde 12/10. Pré-análise, acervos e Vendas continuam como estão.
update usuarios set judicial = false where lower(email) = 'renata@novasaopaulo.com.br';
select nome, judicial, acesso_juridico from usuarios where lower(email) in ('renata@novasaopaulo.com.br','diretor@novasaopaulo.com.br');
