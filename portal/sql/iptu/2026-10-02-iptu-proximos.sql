-- Quando o número exato não está no cadastro (numeração diferente, lote englobado, prédio novo),
-- devolve os números mais próximos da mesma rua — um por número, com a quantidade de unidades.
create or replace function iptu_proximos(p_logradouro text, p_numero text, p_lim integer default 6)
returns table(logradouro text, numero text, unidades bigint, uso text, area_terreno numeric, dif integer)
language sql stable security definer set search_path = public as $$
  with alvo as (select iptu_norm(p_logradouro) l, nullif(regexp_replace(coalesce(p_numero,''),'\D','','g'),'')::int n),
  rua as (  -- a rua mais parecida
    select i.logradouro_norm from iptu i, alvo where i.logradouro_norm % alvo.l
     group by 1 order by max(similarity(i.logradouro_norm, alvo.l)) desc limit 1)
  select min(i.logradouro), i.numero, count(*), min(i.uso), max(i.area_terreno),
         abs(nullif(regexp_replace(i.numero,'\D','','g'),'')::int - alvo.n)
    from iptu i, alvo, rua
   where i.logradouro_norm = rua.logradouro_norm and nullif(regexp_replace(i.numero,'\D','','g'),'') is not null
   group by i.numero, alvo.n
   order by abs(nullif(regexp_replace(i.numero,'\D','','g'),'')::int - alvo.n),
            (nullif(regexp_replace(i.numero,'\D','','g'),'')::int % 2) <> (alvo.n % 2)
   limit greatest(least(p_lim,20),1);
$$;
grant execute on function iptu_proximos(text, text, integer) to anon, authenticated;
