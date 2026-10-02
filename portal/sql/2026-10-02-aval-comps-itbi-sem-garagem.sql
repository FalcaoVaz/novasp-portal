-- aval_comps_itbi (busca por bairro, reserva): exclui vaga de garagem avulsa e depósito (vinham como 'condomínio').
CREATE OR REPLACE FUNCTION public.aval_comps_itbi(p_bairro text, p_lim integer DEFAULT 12)
 RETURNS TABLE(logradouro text, numero text, valor numeric, area_constr numeric, rs_m2 numeric, data date, uso text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select logradouro, numero, valor, area_constr,
         round(valor/area_constr) as rs_m2, data, uso
    from aval_itbi_painel
   where bairro_norm = upper(unaccent(p_bairro))
     and natureza ilike '%compra%' and uso !~* 'GARAGEM|VAGA|DEP[OÓ]SITO' and valor > 0 and area_constr > 0
     and (valor/area_constr) between 1500 and 40000        -- descarta lixo/terreno
   order by data desc nulls last
   limit greatest(p_lim, 1);
$function$
;
