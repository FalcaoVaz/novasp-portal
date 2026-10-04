-- Distância de cada RUA até o imóvel (04/10/2026): menor distância entre o pino e os endereços conhecidos daquela rua
-- (vendas registradas no ITBI, aval_rua_geo). Usada para ficar só com os anúncios perto do imóvel — o anúncio traz a
-- rua, não o número. Nome casado por semelhança ≥ 0,7 (abaixo disso, ex. "Holandeses" × "Invasão dos Holandeses", fica nulo).
-- Abrevia como o ITBI/cadastro escreve (General → GAL, Brigadeiro → BRIG, Nossa Senhora → NSRA…), para casar o nome do anúncio
create or replace function aval_abrev(t text) returns text language sql immutable as $f$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(upper(coalesce(t,'')),
         '\mGENERAL\M','GAL','g'), '\mBRIGADEIRO\M','BRIG','g'), '\mCORONEL\M','CEL','g'), '\mALMIRANTE\M','ALM','g'),
         '\mMARECHAL\M','MAL','g'), '\mDESEMBARGADOR\M','DES','g'), '\mENGENHEIRO\M','ENG','g'), '\mPROFESSORA?\M','PROF','g'),
         '\mDOUTOR\M','DR','g'), '\mPADRE\M','PE','g'), '\mSANTA\M','STA','g'), '\mSANTO\M','STO','g'),
         '\mMINISTRO\M','MIN','g'), '\mPRESIDENTE\M','PRES','g'), '\mCAPITAO\M','CAP','g'), '\mTENENTE\M','TEN','g'),
         '\mVISCONDE\M','VISC','g'), '\mCONSELHEIRO\M','CONS','g'), '\mCOMENDADOR\M','COM','g'), '\mMAJOR\M','MAJ','g'),
         '\mNOSSA SENHORA\M','NSRA','g'), '\mJUNIOR\M','JR','g')
$f$;
create or replace function aval_ruas_distancia(p_lat double precision, p_lng double precision, p_ruas text[])
returns table(rua text, rua_norm text, dist_m integer)
language sql stable security definer set search_path = public as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography g),
  q as (select distinct r rua, aval_norm_rua(r) n from unnest(p_ruas) r where coalesce(r, '') <> ''),
  m as (select q.rua, coalesce(
           (select g.rua_norm from aval_rua_geo g where g.rua_norm % q.n and similarity(g.rua_norm, q.n) >= 0.7 order by similarity(g.rua_norm, q.n) desc limit 1),
           (select g.rua_norm from aval_rua_geo g where g.rua_norm % aval_abrev(q.n) and similarity(g.rua_norm, aval_abrev(q.n)) >= 0.7 order by similarity(g.rua_norm, aval_abrev(q.n)) desc limit 1)) rn
         from q)
  select m.rua, m.rn,
         (select min(st_distance(st_setsrid(st_makepoint(g.lng, g.lat), 4326)::geography, pt.g))::int from aval_rua_geo g where g.rua_norm = m.rn)
    from m, pt;
$$;
revoke all on function aval_ruas_distancia(double precision, double precision, text[]) from public, anon;
grant execute on function aval_ruas_distancia(double precision, double precision, text[]) to authenticated;
