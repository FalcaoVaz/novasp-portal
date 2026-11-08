-- ═══════════════════════════════════════════════════════════════
-- RESTAURAR permissão de executar funções (06/11/2026)
-- Causa: o script do jogo de evento (tabelas/funções evento_*) foi rodado NESTE banco e tinha
--   "revoke all on all functions in schema public from anon, authenticated"
-- → 35 funções do portal pararam para quem está logado (eh_corretor_site, eh_juridico, preanalise_pode, nido_pode_ler,
--   guess_pode_ler, rh_pode, aval_*...). Elas estão nas regras de acesso de quase todas as tabelas.
-- Volta exatamente os grants que estavam nos scripts do portal. Não mexe nas funções evento_*.
-- Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('acervo_pode_ler','agenda_feed_token','aval_anuncios_nsp_perto','aval_comps_itbi','aval_comps_itbi_raio',
         'aval_comps_itbi_raio2','aval_comps_itbi_terreno_raio','aval_cota_definir','aval_cota_eh_admin','aval_cota_estornar',
         'aval_cota_parecer','aval_cota_relatorio','aval_cota_reservar','aval_entorno','aval_fatos','aval_fp','aval_geo',
         'aval_geocode','aval_geocode_endereco','aval_geocode_ruas','aval_lanc_anuncio','aval_lanc_itbi','aval_matricula_por_sql',
         'aval_outorga_ref','aval_prefill_pegar','aval_quadra_ponto','aval_ruas_distancia','aval_terreno_local','eh_corretor_site',
         'eh_juridico','guess_pode_ler','meus_lideres','nido_pode_ler','portal_entrar_corretor','preanalise_pode','rh_pode')
  loop
    execute format('grant execute on function %s to authenticated', f.assinatura); n := n + 1;
  end loop;
  raise notice 'execute devolvido em % função(ões)', n;
end $$;
grant execute on function aval_geo(double precision, double precision) to anon;   -- como estava

-- conferência: deve dar 0
select count(*) as funcoes_do_portal_ainda_sem_acesso
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace
 where s.nspname = 'public' and p.prokind = 'f' and p.proname !~ '^evento_'
   and not has_function_privilege('authenticated', p.oid, 'execute')
   and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
