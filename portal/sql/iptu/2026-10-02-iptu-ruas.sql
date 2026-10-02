-- Ruas do cadastro parecidas com o que o corretor digitou (corrige grafia: "gaiós" → AL DOS GUAIOS).
-- Ordena primeiro as que TÊM o número digitado, depois pela semelhança do nome. Devolve o nome com o tipo (R, AL, AV…).
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
   order by 5 desc, r.s desc
   limit greatest(least(p_lim,10),1);
$$;
grant execute on function iptu_ruas(text, text, integer) to anon, authenticated;

-- Busca EXATA pela rua já identificada (usa o índice logradouro_norm+numero; a aproximada estoura 3 s com nomes comuns como "DOS …").
create or replace function iptu_por_rua(p_logradouro_norm text, p_numero text, p_lim integer default 300)
returns setof iptu language sql stable security definer set search_path = public as $$
  select * from iptu where logradouro_norm = p_logradouro_norm
     and regexp_replace(coalesce(numero,''),'\D','','g') = regexp_replace(coalesce(p_numero,''),'\D','','g')
   order by sql limit greatest(least(p_lim,300),1);
$$;
grant execute on function iptu_por_rua(text, text, integer) to anon, authenticated;
