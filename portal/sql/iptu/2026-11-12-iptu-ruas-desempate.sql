-- 12/11/2026 — desempate em iptu_ruas: "francisco dias" casava 100% (word_similarity) com R FRANCISCO DIAS (Jd. da Saúde)
-- e com R FRANCISCO DIAS VELHO (Brooklin); a ordem entre os dois era aleatória. Agora, entre ruas que têm o número:
-- nome EXATO primeiro, depois a semelhança, depois a semelhança do nome inteiro (penaliza nome mais longo).
create or replace function iptu_ruas(p_logradouro text, p_numero text default null, p_lim integer default 5)
returns table(logradouro text, logradouro_norm text, bairro text, cep text, tem_numero boolean, unidades bigint, sim numeric)
language sql stable security definer set search_path = public as $$
  with alvo as (select iptu_norm(p_logradouro) l, nullif(regexp_replace(coalesce(p_numero,''),'\D','','g'),'') n),
  ruas as (
    select i.logradouro_norm, greatest(similarity(i.logradouro_norm, alvo.l), word_similarity(alvo.l, i.logradouro_norm)) s
      from iptu i, alvo
     where i.logradouro_norm % alvo.l or alvo.l <% i.logradouro_norm
     group by 1, 2 order by 2 desc limit 40)
  select (select regexp_replace(min(i.logradouro),'\s+',' ','g') from iptu i where i.logradouro_norm=r.logradouro_norm),
         r.logradouro_norm,
         (select mode() within group (order by i.bairro) from iptu i where i.logradouro_norm=r.logradouro_norm and i.bairro ~ '^[A-Z ]{4,}$'),
         (select min(i.cep) from iptu i where i.logradouro_norm=r.logradouro_norm),
         exists(select 1 from iptu i, alvo where i.logradouro_norm=r.logradouro_norm and regexp_replace(coalesce(i.numero,''),'\D','','g')=alvo.n),
         (select count(*) from iptu i, alvo where i.logradouro_norm=r.logradouro_norm and regexp_replace(coalesce(i.numero,''),'\D','','g')=alvo.n),
         round(r.s::numeric,2)
    from ruas r
   order by 5 desc, (r.logradouro_norm = (select l from alvo)) desc, r.s desc, similarity(r.logradouro_norm, (select l from alvo)) desc
   limit greatest(least(p_lim,10),1);
$$;
grant execute on function iptu_ruas(text, text, integer) to anon, authenticated;
