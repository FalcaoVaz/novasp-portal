#!/usr/bin/env python3
"""Preenche aval_itbi.geom/distrito com a coordenada do PRÉDIO (logradouro+número) medida no Foca (dados/itbi_geo.csv,
mediana das transações do mesmo endereço, caixa de SP) e, sem prédio, com o centro do CEP. Dado público (endereços e coordenadas)."""
import csv, os, io, statistics as st, collections, psycopg2
F=os.path.expanduser('~/Downloads/foca/dados/itbi_geo.csv')
ok=lambda la,lo: -24.05<la<-23.35 and -46.85<lo<-46.35
pred=collections.defaultdict(list); cep=collections.defaultdict(list); dist={}
for r in csv.DictReader(open(F,encoding='utf-8')):
    try: la=float(r['lat']); lo=float(r['lng'])
    except: continue
    if not ok(la,lo): continue
    k=(r['Nome do Logradouro'].strip().upper(), str(r['Número']).strip().lstrip('0'))
    pred[k].append((la,lo)); c=str(r['cep']).split('.')[0].zfill(8); cep[c].append((la,lo))
    d=r.get('distrito_geo') or r.get('distrito');
    if d: dist[k]=d; dist[('CEP',c)]=d
def med(l): return (st.median([x[0] for x in l]), st.median([x[1] for x in l]))
c=psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip(), connect_timeout=30); cur=c.cursor()
cur.execute("set statement_timeout=0")
cur.execute("create temp table _p (logradouro text, numero text, lat float8, lng float8, distrito text)")
cur.execute("create temp table _c (cep text, lat float8, lng float8, distrito text)")
b=io.StringIO()
for (lg,n),l in pred.items(): la,lo=med(l); b.write(f"{lg}\t{n}\t{la}\t{lo}\t{dist.get((lg,n),'')}\n")
b.seek(0); cur.copy_from(b,'_p',null='')
b=io.StringIO()
for k,l in cep.items(): la,lo=med(l); b.write(f"{k}\t{la}\t{lo}\t{dist.get(('CEP',k),'')}\n")
b.seek(0); cur.copy_from(b,'_c',null='')
cur.execute("create index on _p (logradouro, numero); create index on _c (cep)")
cur.execute("""update aval_itbi i set geom=st_setsrid(st_makepoint(p.lng,p.lat),4326), distrito=nullif(p.distrito,'')
                 from _p p where i.geom is null and p.logradouro=upper(trim(i.logradouro)) and p.numero=ltrim(trim(i.numero),'0')""")
print('por prédio:', cur.rowcount)
cur.execute("""update aval_itbi i set geom=st_setsrid(st_makepoint(cc.lng,cc.lat),4326), distrito=coalesce(i.distrito,nullif(cc.distrito,''))
                 from _c cc where i.geom is null and cc.cep=lpad(regexp_replace(i.cep,'\\D','','g'),8,'0')""")
print('por CEP:', cur.rowcount)
c.commit()
cur.execute("select count(*), count(geom) from aval_itbi"); print('aval_itbi total / com geom:', cur.fetchone())
cur.execute("analyze aval_itbi"); c.commit()
cur.execute("select pg_size_pretty(pg_database_size(current_database()))"); print('banco:', cur.fetchone()[0])
