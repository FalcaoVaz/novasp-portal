-- ═══════════════════════════════════════════════════════════════
-- Usuário de banco SÓ para a carga semanal dos anúncios (GitHub Actions, .github/workflows/anuncios-nsp.yml).
-- Ele só lê, apaga e insere em aval_anuncios_nsp: não enxerga nenhuma outra tabela. Se o segredo vazar, o estrago
-- se limita aos anúncios, que se refazem na carga seguinte.
-- ANTES DE RODAR: troque TROQUE-PELA-SENHA por uma senha longa (no Terminal: openssl rand -hex 24). Não mande a senha
-- em chat; ela vai só aqui e no segredo NOVASP_DSN_ANUNCIOS do GitHub.
-- ═══════════════════════════════════════════════════════════════
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'carga_anuncios_nsp') then
    create role carga_anuncios_nsp login password 'TROQUE-PELA-SENHA';
  end if;
end $$;
grant usage on schema public to carga_anuncios_nsp;
grant select, insert, delete on aval_anuncios_nsp to carga_anuncios_nsp;
drop policy if exists carga_anuncios on aval_anuncios_nsp;
create policy carga_anuncios on aval_anuncios_nsp for all to carga_anuncios_nsp using (true) with check (true);

select 'ok — usuário carga_anuncios_nsp' as status;
